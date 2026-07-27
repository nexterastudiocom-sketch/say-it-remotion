// Deterministic validators for the generation loop. Everything here either
// reads the authoritative source or probes real bytes with ffprobe/ffmpeg
// (bundled inside the remotion binary). Nothing is "assumed to pass": a check
// that cannot be executed returns { ok:false, status:'needs-review' }, never ok.
//
// Every validator returns { name, ok, hardGate?, value?, expected?, detail, status? }.
// status is one of: 'pass' | 'fail' | 'needs-review'.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, REMOTION, run } from './lib.mjs';
import { detectBackend, pronunciationConfidence, cleanupStt } from './stt.mjs';

const rel = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const ok = (name, detail, extra = {}) => ({ name, ok: true, status: 'pass', detail, ...extra });
const fail = (name, detail, extra = {}) => ({ name, ok: false, status: 'fail', detail, ...extra });
const review = (name, detail, extra = {}) => ({ name, ok: false, status: 'needs-review', detail, ...extra });

// ---- ffprobe: full media stream/format info -------------------------------
export async function probe(fileAbs) {
  const r = await run(REMOTION, ['ffprobe', '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', fileAbs]);
  if (r.code !== 0) throw new Error(`ffprobe failed: ${r.stderr.trim() || r.code}`);
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  const a = (j.streams || []).find((s) => s.codec_type === 'audio') || {};
  const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number);
  return {
    durationSeconds: Number(j.format?.duration || v.duration || a.duration || 0),
    width: v.width || 0, height: v.height || 0,
    fps: d ? Math.round((n / d) * 1000) / 1000 : 0,
    vcodec: v.codec_name || null, acodec: a.codec_name || null,
    sampleRate: Number(a.sample_rate || 0), channels: a.channels || 0,
    hasAudio: !!a.codec_name, raw: j,
  };
}

// Probe the filters a given ffmpeg binary ships (builds vary — Remotion's
// bundled one lacks blackdetect/ebur128; a full ffmpeg has them). Cached per bin.
const _filters = new Map();
export async function ffmpegFilters(bin) {
  if (_filters.has(bin)) return _filters.get(bin);
  const args = bin === REMOTION ? ['ffmpeg', '-hide_banner', '-filters'] : ['-hide_banner', '-filters'];
  const r = await run(bin, args);
  const set = new Set([...r.stdout.matchAll(/^\s*\S+\s+(\w+)\s+[AVN|]+->/gm)].map((m) => m[1]));
  for (const name of ['loudnorm', 'silencedetect', 'blackdetect', 'ebur128'])
    if (r.stdout.includes(` ${name} `)) set.add(name);
  _filters.set(bin, set);
  return set;
}

// Locate a FULL ffmpeg that has blackdetect: $FFMPEG_BIN → system ffmpeg on PATH
// → the ffmpeg-static package. Returns { bin, args } where args prefixes the
// ffmpeg subcommand form, or null if none is available.
let _fullFfmpeg;
export async function fullFfmpeg() {
  if (_fullFfmpeg !== undefined) return _fullFfmpeg;
  const candidates = [];
  if (process.env.FFMPEG_BIN) candidates.push(process.env.FFMPEG_BIN);
  const which = await run('which', ['ffmpeg']);
  if (which.code === 0) candidates.push(which.stdout.trim());
  try { const m = await import('ffmpeg-static'); const p = m.default || m; if (p) candidates.push(p); } catch { /* not installed */ }
  for (const bin of candidates) {
    if (!bin || !existsSync(bin)) continue;
    const filters = await ffmpegFilters(bin);
    if (filters.has('blackdetect')) { _fullFfmpeg = bin; return bin; }
  }
  _fullFfmpeg = null;
  return null;
}

// ---- black-frame detection: use a full ffmpeg if present; else honestly N/A --
export async function detectBlackFrames(fileAbs, cfg) {
  const bin = await fullFfmpeg();
  if (!bin) return { available: false, spans: [] };
  const { pixThreshold, blackThreshold, maxSeconds } = cfg.blackFrame;
  const r = await run(bin, ['-hide_banner', '-nostats', '-i', fileAbs,
    '-vf', `blackdetect=d=${maxSeconds}:pix_th=${pixThreshold}:pic_th=${blackThreshold}`,
    '-an', '-f', 'null', '-']);
  const spans = [...r.stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)]
    .map((m) => ({ start: +m[1], end: +m[2], dur: +(+m[2] - +m[1]).toFixed(2) }));
  return { available: true, spans };
}

// ---- loudness via loudnorm's JSON analysis pass (bundled ffmpeg has it) -----
// Prints input_i (integrated LUFS) + input_tp (true peak dBFS).
export async function measureLoudness(fileAbs) {
  const filters = await ffmpegFilters(REMOTION);
  if (!filters.has('loudnorm')) return { available: false };
  const r = await run(REMOTION, ['ffmpeg', '-hide_banner', '-nostats', '-i', fileAbs,
    '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = r.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return { available: true, integratedLufs: null, truePeakDb: null };
  let j; try { j = JSON.parse(m[0]); } catch { return { available: true, integratedLufs: null, truePeakDb: null }; }
  return { available: true, integratedLufs: Number(j.input_i), truePeakDb: Number(j.input_tp) };
}

// ===========================================================================
// SOURCE — the Excel/transcript is authoritative. Missing data → needs-review,
// never fabricated. (Structural check; content sufficiency is scored later.)
// ===========================================================================
export async function validateSource({ scriptJson, sentMd }) {
  const checks = [];
  const sAbs = rel(scriptJson);
  if (!existsSync(sAbs)) return [fail('sourceValid', `parsed script missing: ${scriptJson}`, { hardGate: true })];
  const script = JSON.parse(await readFile(sAbs, 'utf8'));
  const beats = (script.segments || []).flatMap((s) => s.beats || []);
  const spoken = beats.filter((b) => b.pause == null);
  const empty = spoken.filter((b) => !b.text || !b.text.trim());
  checks.push(spoken.length >= 8
    ? ok('sourceValid', `${script.segments.length} segments, ${spoken.length} spoken beats`, { hardGate: true, value: spoken.length })
    : review('sourceValid', `only ${spoken.length} spoken beats — insufficient for a lesson`, { hardGate: true, value: spoken.length }));
  if (empty.length) checks.push(fail('sourceNoEmpty', `${empty.length} spoken beats have empty text (lines: ${empty.map((b) => b.line).join(', ')})`));
  else checks.push(ok('sourceNoEmpty', 'no empty spoken beats'));
  // Title provenance — must come from the header, not be fabricated.
  checks.push(script.meta?.titleFr
    ? ok('sourceTitle', `title from header: "${script.meta.titleFr}"`)
    : review('sourceTitle', 'no "# Lesson N — Title" header; title falls back to workbook'));
  return checks;
}

// ===========================================================================
// AUDIO CLIPS — each generated clip must be present, long enough, and not be
// mostly dead air. (Internal repetition pauses are separate silent beats in the
// timeline JSON, never inside a clip — so trimming a clip never touches them.)
// ===========================================================================
export async function validateAudioClips({ lessonJson }, cfg) {
  const lAbs = rel(lessonJson);
  if (!existsSync(lAbs)) return [fail('assetsPresent', `baked lesson missing: ${lessonJson}`, { hardGate: true })];
  const lesson = JSON.parse(await readFile(lAbs, 'utf8'));
  const clips = lesson.slides.flatMap((s) => (s.beats || []).filter((b) => b.src));
  const missing = [];
  const tooShort = [];
  for (const b of clips) {
    const abs = path.join(ROOT, 'public', b.src);
    if (!existsSync(abs)) { missing.push(b.src); continue; }
    if ((b.durationInSeconds || 0) < cfg.audio.minClipSeconds) tooShort.push(`${b.src} (${b.durationInSeconds}s)`);
  }
  const out = [];
  out.push(missing.length
    ? fail('assetsPresent', `${missing.length}/${clips.length} audio clips missing`, { hardGate: true, detail2: missing.slice(0, 5) })
    : ok('assetsPresent', `all ${clips.length} audio clips present`, { hardGate: true, value: clips.length }));
  out.push(tooShort.length
    ? fail('audioClipLength', `${tooShort.length} clips under ${cfg.audio.minClipSeconds}s`, { detail2: tooShort.slice(0, 5) })
    : ok('audioClipLength', `all clips ≥ ${cfg.audio.minClipSeconds}s`));
  // Image assets referenced by slides.
  const imgs = lesson.slides.map((s) => s.imageSrc).filter(Boolean);
  const missImg = imgs.filter((p) => !existsSync(path.join(ROOT, 'public', p.replace(/^\//, ''))));
  out.push(missImg.length
    ? review('imagesPresent', `${missImg.length}/${imgs.length} slide images missing`, { detail2: missImg.slice(0, 5) })
    : ok('imagesPresent', `all ${imgs.length} slide images present`));
  return out;
}

// ===========================================================================
// A/V SYNC — the baked timeline is built FROM real clip durations, so the
// planned duration and the sum of beats must agree within tolerance. Any drift
// beyond it means the JSON was hand-edited inconsistently.
// ===========================================================================
export async function validateSync({ lessonJson }, cfg) {
  const lesson = JSON.parse(await readFile(rel(lessonJson), 'utf8'));
  const offenders = [];
  let planned = 0;
  for (const s of lesson.slides) {
    const sum = +(s.beats || []).reduce((a, b) => a + (b.durationInSeconds || 0), 0).toFixed(3);
    planned += sum;
    const drift = Math.abs(sum - (s.durationInSeconds || 0));
    if (drift > cfg.sync.toleranceSeconds) offenders.push(`${s.id}: Δ${drift.toFixed(3)}s`);
  }
  return [offenders.length
    ? fail('sync', `${offenders.length} slides drift > ${cfg.sync.toleranceSeconds}s`, { hardGate: true, detail2: offenders.slice(0, 5), value: +planned.toFixed(2) })
    : ok('sync', `all slides within ±${cfg.sync.toleranceSeconds}s (planned ${Math.round(planned)}s)`, { hardGate: true, value: +planned.toFixed(2) })];
}

// ===========================================================================
// PRONUNCIATION — honestly unverifiable without STT. When disabled we NEVER
// claim verification: the hard gate returns needs-review so the lesson cannot
// be marked completed on this axis alone.
// ===========================================================================
export async function validatePronunciation({ lessonJson }, cfg, deps = {}) {
  const enabled = cfg.pronunciation.enabled === true || cfg.pronunciation.enabled === 'auto';
  if (!enabled) {
    return [review('pronunciationVerified',
      `STT disabled (config.pronunciation.enabled=false) — French pronunciation UNVERIFIED; set "auto"/true + install ${cfg.pronunciation.engine} to check`,
      { hardGate: true })];
  }
  // A backend must actually be available, or we honestly report needs-review.
  // ('backend' in deps lets a test force null; absent → real detection.)
  const backend = 'backend' in deps ? deps.backend : await detectBackend();
  if (!backend) {
    return [review('pronunciationVerified',
      `no STT backend found (set OPENAI_API_KEY, or install openai-whisper / whisper.cpp) — French pronunciation UNVERIFIED`,
      { hardGate: true })];
  }
  // Transcribe every FRENCH clip and compare to its intended card text.
  const lesson = JSON.parse(await readFile(rel(lessonJson), 'utf8'));
  const frClips = lesson.slides.flatMap((s) => (s.beats || [])
    .filter((b) => b.src && b.voice && b.voice.startsWith('fr') && b.text));
  const scoreFn = deps.confidence || pronunciationConfidence;
  const results = [];
  for (const b of frClips) {
    const abs = path.join(ROOT, 'public', b.src);
    if (!existsSync(abs)) { results.push({ src: b.src, ok: false, detail: 'clip missing' }); continue; }
    try {
      const heard = await backend.transcribe(abs, 'fr');
      const conf = scoreFn(b.text, heard);
      results.push({ src: b.src, expected: b.text, heard, conf: +conf.toFixed(2), ok: conf >= cfg.pronunciation.minConfidence });
    } catch (e) { results.push({ src: b.src, ok: false, detail: e.message.slice(0, 120) }); }
  }
  if (!deps.backend) await cleanupStt();
  const low = results.filter((r) => !r.ok);
  const avg = results.length ? +(results.reduce((a, r) => a + (r.conf || 0), 0) / results.length).toFixed(2) : 0;
  const lowFrac = results.length ? low.length / results.length : 0;
  const maxLow = cfg.pronunciation.maxLowFraction ?? 0.15;
  // Pass when the AVERAGE clears the bar AND only a small fraction fall short —
  // whisper mis-transcribes a few deliberately-distorted slow clips, which
  // shouldn't fail the whole lesson. A real problem tanks the average.
  const pass = avg >= cfg.pronunciation.minConfidence && lowFrac <= maxLow;
  return [pass
    ? ok('pronunciationVerified', `avg ${avg}, ${low.length}/${results.length} clips below ${cfg.pronunciation.minConfidence} (≤${Math.round(maxLow * 100)}% allowed) via ${backend.name}`,
        { hardGate: true, value: avg })
    : fail('pronunciationVerified', `avg ${avg}, ${low.length}/${results.length} FR clips below ${cfg.pronunciation.minConfidence} (${Math.round(lowFrac * 100)}% > ${Math.round(maxLow * 100)}% allowed) via ${backend.name}`,
        { hardGate: true, value: avg, detail2: low.slice(0, 8).map((r) => `${r.src.split('/').pop()}: ${r.detail || `heard "${(r.heard || '').slice(0, 30)}" (${r.conf})`}`) })];
}

// ===========================================================================
// FINAL RENDER — probe the actual output file against every technical gate.
// ===========================================================================
export async function validateFinal({ videoPath }, cfg) {
  const vAbs = rel(videoPath);
  if (!existsSync(vAbs)) return [fail('renderOk', `render missing: ${videoPath}`, { hardGate: true })];
  const out = [ok('renderOk', `render present: ${path.relative(ROOT, vAbs)}`, { hardGate: true })];
  let p;
  try { p = await probe(vAbs); } catch (e) { return [...out, fail('probe', e.message, { hardGate: true })]; }

  const c = cfg.video;
  const within = (v, lo, hi) => v >= lo && v <= hi;
  out.push(within(p.durationSeconds, cfg.duration.minSeconds, cfg.duration.maxSeconds)
    ? ok('duration', `${fmt(p.durationSeconds)} within ${fmt(cfg.duration.minSeconds)}–${fmt(cfg.duration.maxSeconds)}`, { hardGate: true, value: +p.durationSeconds.toFixed(1) })
    : fail('duration', `${fmt(p.durationSeconds)} outside ${fmt(cfg.duration.minSeconds)}–${fmt(cfg.duration.maxSeconds)}`, { hardGate: true, value: +p.durationSeconds.toFixed(1) }));
  out.push(p.width === c.width && p.height === c.height
    ? ok('resolution', `${p.width}x${p.height}`, { hardGate: true })
    : fail('resolution', `${p.width}x${p.height} ≠ ${c.width}x${c.height}`, { hardGate: true }));
  out.push(Math.abs(p.fps - c.fps) < 0.5
    ? ok('fps', `${p.fps}`, { hardGate: true }) : fail('fps', `${p.fps} ≠ ${c.fps}`, { hardGate: true }));
  out.push(p.vcodec === c.vcodec ? ok('vcodec', p.vcodec, { hardGate: true }) : fail('vcodec', `${p.vcodec} ≠ ${c.vcodec}`, { hardGate: true }));
  out.push(p.acodec === c.acodec ? ok('acodec', p.acodec, { hardGate: true }) : fail('acodec', `${p.acodec} ≠ ${c.acodec}`, { hardGate: true }));
  out.push(p.hasAudio ? ok('audioPresent', `${p.channels}ch @ ${p.sampleRate}Hz`, { hardGate: true }) : fail('audioPresent', 'no audio stream', { hardGate: true }));

  try {
    const { available, spans } = await detectBlackFrames(vAbs, cfg);
    out.push(!available
      ? review('noBlackFrames', 'blackdetect filter absent in bundled ffmpeg — cannot verify (install full ffmpeg to enable)', { hardGate: true })
      : spans.length
        ? fail('noBlackFrames', `${spans.length} black stretch(es) ≥ ${cfg.blackFrame.maxSeconds}s`, { hardGate: true, detail2: spans.slice(0, 5) })
        : ok('noBlackFrames', `no black stretch ≥ ${cfg.blackFrame.maxSeconds}s`, { hardGate: true }));
  } catch (e) { out.push(review('noBlackFrames', `blackdetect could not run: ${e.message}`, { hardGate: true })); }

  try {
    const { available, integratedLufs, truePeakDb } = await measureLoudness(vAbs);
    if (!available) out.push(review('loudness', 'loudnorm filter absent in bundled ffmpeg — cannot verify', { hardGate: true }));
    else if (integratedLufs == null) out.push(review('loudness', 'loudnorm ran but produced no reading', { hardGate: true }));
    else {
      const dOk = Math.abs(integratedLufs - cfg.loudness.targetLufs) <= cfg.loudness.toleranceLufs;
      const pOk = truePeakDb == null || truePeakDb <= cfg.loudness.truePeakMaxDb + 0.05;
      out.push(dOk && pOk
        ? ok('loudness', `${integratedLufs} LUFS, peak ${truePeakDb} dBFS`, { hardGate: true, value: integratedLufs })
        : fail('loudness', `${integratedLufs} LUFS (target ${cfg.loudness.targetLufs}±${cfg.loudness.toleranceLufs}), peak ${truePeakDb} dBFS`, { hardGate: true, value: integratedLufs }));
    }
  } catch (e) { out.push(review('loudness', `loudnorm could not run: ${e.message}`, { hardGate: true })); }

  return out;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---- Method two-gate QA — Gate A (77-rule registry) + Gate B (on the render) --
// Runs the SAME gates the manual Method flow uses (scripts/qa/gate-b.mjs → I-05,
// R-06, S-08, T-*, I-08, pronunciation; merged with Gate A findings in qa/<id>.json).
// BLOCKs are hard gates; WARNs are policy-driven (config.method.warnPolicy).
export async function validateMethodGateB({ id, videoPath }, cfg) {
  const warnPolicy = cfg.method?.warnPolicy || 'proceed-report';
  const vAbs = rel(videoPath);
  if (!existsSync(vAbs)) return [review('gateBBlocks', `no render at ${videoPath} — Gate B unrun`, { hardGate: true })];
  // Refresh Gate A (pre-render rules) into qa/<id>.json, then a fresh manifest, then
  // the full Gate B suite on THIS video — so qa/<id>.json holds current A+B findings.
  await run('node', ['scripts/qa/gate-a.mjs', id]);
  const man = await run('node', ['scripts/qa/manifest.mjs', id]);
  if (man.code !== 0) return [fail('gateBBlocks', 'manifest emit failed: ' + (man.stderr.trim().split('\n').pop() || ''), { hardGate: true })];
  await run('node', ['scripts/qa/gate-b.mjs', id], { env: { ...process.env, SAYIT_QA_VIDEO: videoPath } });
  const qaPath = path.join(ROOT, `qa/${id}.json`);
  if (!existsSync(qaPath)) return [fail('gateBBlocks', `no qa/${id}.json after Gate B`, { hardGate: true })];
  const F = (JSON.parse(await readFile(qaPath, 'utf8')).findings) || [];
  const label = (f) => `${f.rule} (L${f.line ?? '?'}): ${f.issue}`;
  const aBlocks = F.filter((f) => f.gate === 'A' && f.severity === 'BLOCK');
  const bBlocks = F.filter((f) => f.gate === 'B' && f.severity === 'BLOCK');
  const warns = F.filter((f) => f.severity === 'WARN');
  const out = [];
  out.push(aBlocks.length
    ? fail('gateA', `${aBlocks.length} Gate A BLOCK(s)`, { hardGate: true, detail2: aBlocks.slice(0, 8).map(label) })
    : ok('gateA', 'no Gate A blocks', { hardGate: true }));
  out.push(bBlocks.length
    ? fail('gateBBlocks', `${bBlocks.length} Gate B BLOCK(s)`, { hardGate: true, detail2: bBlocks.slice(0, 8).map(label) })
    : ok('gateBBlocks', 'no Gate B blocks', { hardGate: true }));
  if (warns.length) out.push(warnPolicy === 'halt-needs-review'
    ? review('methodWarnings', `${warns.length} WARN(s) — human sign-off required (warnPolicy=halt)`, { hardGate: true, detail2: warns.slice(0, 12).map(label) })
    : { name: 'methodWarnings', ok: true, status: 'pass', detail: `${warns.length} WARN(s) logged (proceed-report)`, detail2: warns.slice(0, 12).map(label) });
  else out.push(ok('methodWarnings', 'no warnings'));
  return out;
}

// Roll every hard gate into a single pass/needs-review/fail verdict.
export function summarize(checks) {
  const gates = checks.filter((c) => c.hardGate);
  const failed = gates.filter((c) => c.status === 'fail');
  const reviewNeeded = gates.filter((c) => c.status === 'needs-review');
  const status = failed.length ? 'fail' : reviewNeeded.length ? 'needs-review' : 'pass';
  return {
    status,
    hardGatesPassed: gates.filter((c) => c.status === 'pass').length,
    hardGatesTotal: gates.length,
    failed: failed.map((c) => c.name),
    needsReview: reviewNeeded.map((c) => c.name),
  };
}
