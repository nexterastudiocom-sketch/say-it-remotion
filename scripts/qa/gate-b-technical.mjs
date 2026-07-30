#!/usr/bin/env node
// GATE B · technical  (L1, rules T-01…T-08)  — standalone
//
//   node scripts/qa/gate-b-technical.mjs <video-id>
//   MOSAIC_QA_VIDEO=out/films/<id>-preview.mp4 node scripts/qa/gate-b-technical.mjs <id>
//
// Deterministic container/technical checks from mosaic_rules.yaml `technical:`.
// Probes with the bundled ffprobe; loudness + dropout via ffmpeg-static.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, run, REMOTION, ffmpegStatic, ROOT } from './lib.mjs';
import { rules, finding, merge } from './gateb.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.video)) { console.error(`✗ no render: ${P.video}`); process.exit(2); }
const Y = await rules();
const T = Y.technical;
const F = [];

// ---- ffprobe ----
const pr = await run(REMOTION, ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', P.video]);
if (pr.code !== 0) { console.error('ffprobe failed:', pr.stderr.trim()); process.exit(2); }
const probe = JSON.parse(pr.stdout);
const v = (probe.streams || []).find((s) => s.codec_type === 'video') || {};
const a = (probe.streams || []).find((s) => s.codec_type === 'audio') || {};
const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number);
const fps = d ? n / d : 0;
const duration = Number(probe.format?.duration || 0);

if (v.width !== T.resolution[0] || v.height !== T.resolution[1])
  F.push(finding(Y, 'T-01', 0, `resolution ${v.width}x${v.height} (need ${T.resolution.join('x')})`, ''));
if (Math.abs(fps - T.fps) > 0.01)
  F.push(finding(Y, 'T-02', 0, `frame rate ${fps.toFixed(3)} (need ${T.fps})`, ''));
if (v.codec_name !== T.video_codec)
  F.push(finding(Y, 'T-03', 0, `video codec ${v.codec_name} (need ${T.video_codec})`, ''));
else { const mbps = Number(v.bit_rate || 0) / 1e6; if (mbps && mbps < T.video_bitrate_mbps * 0.9) F.push(finding(Y, 'T-03', 0, `video bitrate ${mbps.toFixed(1)} Mbps (need ≥${T.video_bitrate_mbps})`, '')); }
if (a.codec_name !== T.audio_codec) F.push(finding(Y, 'T-04', 0, `audio codec ${a.codec_name} (need ${T.audio_codec})`, ''));
else { const kbps = Number(a.bit_rate || 0) / 1000; if (kbps && kbps < T.audio_bitrate_kbps * 0.9) F.push(finding(Y, 'T-04', 0, `audio bitrate ${kbps.toFixed(0)} kbps (need ≥${T.audio_bitrate_kbps})`, '')); }

// ---- loudness (ffmpeg-static loudnorm analysis) ----
const ff = ffmpegStatic() || REMOTION;
const ffPre = ff === REMOTION ? ['ffmpeg'] : [];
const ln = await run(ff, [...ffPre, '-hide_banner', '-nostats', '-i', P.video, '-vn', '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
const m = ln.stderr.match(/\{[\s\S]*?input_i[\s\S]*?\}/);
let lufs = null, tp = null;
if (m) { try { const j = JSON.parse(m[0]); lufs = Number(j.input_i); tp = Number(j.input_tp); } catch {} }
if (lufs != null && Math.abs(lufs - T.loudness_lufs) > T.loudness_tolerance)
  F.push(finding(Y, 'T-05', 0, `integrated loudness ${lufs} LUFS (need ${T.loudness_lufs}±${T.loudness_tolerance})`, ''));
if (tp != null && tp > T.true_peak_max_dbtp)
  F.push(finding(Y, 'T-06', 0, `true peak ${tp} dBTP (max ${T.true_peak_max_dbtp})`, ''));

// ---- T-07 audio DROPOUTS inside a taught utterance = a long dead-air hole INSIDE
// a single French SOURCE clip. Scanned on the source clips the bake produced, NOT
// the render timeline: the manifest's cumulative time drifts tens of seconds from
// the real render across a 17-min film, so render-position attribution (ASR words
// vs manifest windows) misfires — a deliberate Method pause BETWEEN two beats gets
// mislabelled "inside a voice line" (verified: both Marc dialogue clips measure
// dead-air-free even at −60dB, yet the drifted window flagged them). A clip-internal
// scan is drift-proof and deterministic: a real dropout is a hole WITHIN one atomic
// utterance's audio; a pause between two clips lives in neither clip, so it is
// correctly ignored. Atomic utterances only (≤4.5s) — long narration beats carry
// legitimate clause pauses; ellipsis beats are scripted trailing silence.
if (existsSync(P.manifest)) {
  const man = await readJson(P.manifest);
  const GAP = 1.0;   // interior hole longer than this = dropout (spec floor 0.2, raised for natural sentence pauses)
  const EDGE = 0.15; // ignore leading/trailing clip padding
  const seen = new Set();
  let scanned = 0;
  for (const r of man.lines) {
    if (r.kind !== 'french' || !r.audioAsset || !(r.durationSeconds <= 4.5)) continue;
    if (/\.\.\.|…/.test(r.spokenText || '')) continue;
    if (seen.has(r.audioAsset)) continue;
    seen.add(r.audioAsset);
    const abs = path.join(ROOT, 'public', r.audioAsset);
    if (!existsSync(abs)) continue;
    scanned++;
    const sd = await run(ff, [...ffPre, '-hide_banner', '-nostats', '-i', abs, '-af', 'silencedetect=noise=-40dB:d=0.3', '-f', 'null', '-']);
    const dm = sd.stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const clipLen = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3]) : (r.durationSeconds || 0);
    const iv = []; let st = null;
    for (const mm of sd.stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
      if (mm[1] === 'start') st = Number(mm[2]);
      else if (st != null) { iv.push([st, Number(mm[2])]); st = null; }
    }
    for (const [a2, b2] of iv) {
      const len = b2 - a2;
      if (len <= GAP) continue;
      if (b2 <= EDGE) continue;                       // leading padding
      if (clipLen && a2 >= clipLen - EDGE) continue;  // trailing padding
      F.push(finding(Y, 'T-07', r.sourceLine || 0, `${len.toFixed(2)}s dead-air inside taught clip at ${a2.toFixed(2)}s ("${(r.spokenText || '').slice(0, 30)}")`, r.audioAsset));
      break; // one finding per clip
    }
  }
  console.log(`  (T-07 scanned ${scanned} atomic French clips for interior dropouts)`);
}

// ---- T-08 runtime within the density band ----
let band = null;
if (existsSync(P.qa)) { try { const q = await readJson(P.qa); const lvl = String(q.meta?.level || 'A1').toUpperCase(); const ln2 = Number(q.meta?.lesson || String(id).replace(/\D/g, '') || 1); band = lvl === 'A1' ? (ln2 <= 5 ? 'A1_1_5' : ln2 <= 15 ? 'A1_6_15' : 'A1_16_30') : (Y.density[lvl] ? lvl : null); } catch {} }
if (band && Y.density[band]) {
  const [lo, hi] = Y.density[band].runtime_min;
  const mins = duration / 60;
  if (mins < lo || mins > hi) F.push(finding(Y, 'T-08', 0, `runtime ${mins.toFixed(1)} min outside band ${band} (${lo}–${hi} min)`, ''));
}

await merge(id, ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07', 'T-08'], F,
  { technical: { resolution: [v.width, v.height], fps: +fps.toFixed(3), lufs, true_peak: tp, duration_s: +duration.toFixed(1) } });
console.log(`GATE B · technical — ${v.width}x${v.height} ${fps.toFixed(0)}fps ${v.codec_name}/${a.codec_name} ${lufs} LUFS peak ${tp} dBTP ${(duration / 60).toFixed(1)}min`);
if (!F.length) console.log('  ✓ T-01…T-08 pass.');
else for (const f of F) console.log(`  ${f.severity === 'BLOCK' ? '✗' : '⚠'} ${f.rule} ${f.issue}`);
process.exit(F.some((f) => f.severity === 'BLOCK') ? 1 : 0);
