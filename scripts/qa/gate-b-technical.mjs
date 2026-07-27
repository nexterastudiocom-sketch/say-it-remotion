#!/usr/bin/env node
// GATE B · technical  (L1, rules T-01…T-08)  — standalone
//
//   node scripts/qa/gate-b-technical.mjs <video-id>
//   SAYIT_QA_VIDEO=out/films/<id>-preview.mp4 node scripts/qa/gate-b-technical.mjs <id>
//
// Deterministic container/technical checks from say_it_rules.yaml `technical:`.
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

// ---- T-07 audio DROPOUTS inside a voice line = a long silence BETWEEN two
// spoken words that falls inside a voice-line window (not a declared pause, not
// leading/trailing clip padding). Uses ASR word timestamps if available.
const asrPath = path.join(ROOT, `build/${id}/asr.json`);
if (existsSync(P.manifest) && existsSync(asrPath)) {
  const man = await readJson(P.manifest);
  const asr = await readJson(asrPath);
  const GAP = 1.0; // CALIBRATE: spec floor 0.2; raised so natural TTS punctuation pauses ("Oui. Non.") aren't flagged as dropouts
  // Atomic taught utterances (≤4.5s) — long narration beats have natural clause
  // pauses that are not dropouts; the Method grammar keeps beats atomic anyway.
  // Scope to FRENCH lines only: the on-screen caption (X-06) and the P(beat)
  // atomicity contract are target-language. English scaffolding cues ("Listen.
  // … Don't say anything yet", "Now you — hi.") carry no synced caption, so a
  // rhetorical pause at their period/em-dash is narration, not a dropout.
  const inSpoken = (t) => man.lines.find((r) => r.kind === 'french' && r.audioAsset && r.durationSeconds <= 4.5 && t >= r.videoStart + 0.1 && t <= r.videoEnd - 0.1 && !/\.\.\.|…/.test(r.spokenText || ''));
  const w = (asr.words || []).filter((x) => x.end > x.start);
  for (let i = 1; i < w.length; i++) {
    const gap = w[i].start - w[i - 1].end;
    if (gap <= GAP) continue;
    const b = inSpoken(w[i - 1].end + gap / 2); // gap sits inside one voice line
    if (b && w[i].start <= b.videoEnd) F.push(finding(Y, 'T-07', b.sourceLine || 0, `${gap.toFixed(2)}s gap between words inside a voice line at ${w[i - 1].end.toFixed(1)}s ("${(b.spokenText || '').slice(0, 30)}")`, ''));
  }
} else if (existsSync(P.manifest)) {
  console.log('  (T-07 skipped — no build/' + id + '/asr.json; run scripts/qa/asr.mjs first)');
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
