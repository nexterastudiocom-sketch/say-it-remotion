// Two-pass EBU R128 loudness normalization on a rendered file, using the
// bundled ffmpeg's `loudnorm` filter (the minimal Remotion build HAS this one).
//
//   node scripts/pipeline/normalize.mjs <in.mp4> [out.mp4]
//
// Pass 1 measures the file; pass 2 applies the correction with the measured
// values (linear=true → accurate, transparent gain, not dynamic compression).
// Video is stream-copied; only the audio is re-encoded (AAC 48k stereo), so it's
// fast and never touches the picture or the intentional silent repetition beats.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, REMOTION, run, loadConfig } from './lib.mjs';

// Measure integrated loudness / true peak / LRA / threshold via loudnorm's
// analysis pass. Returns the numbers pass 2 needs, or null if unavailable.
export async function measure(inAbs, target) {
  const filter = `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`;
  const r = await run(REMOTION, ['ffmpeg', '-hide_banner', '-nostats', '-i', inAbs,
    '-vn', '-af', filter, '-f', 'null', '-']);
  const m = r.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  return {
    measured_I: j.input_i, measured_TP: j.input_tp, measured_LRA: j.input_lra,
    measured_thresh: j.input_thresh, offset: j.target_offset,
  };
}

export async function normalizeLoudness(inAbs, outAbs, cfg) {
  // Target a true peak 0.5 dB BELOW the gate max — loudnorm's linear limiter can
  // overshoot its target slightly, so aiming at the gate (-1.0) can land at -0.9
  // and fail. Aiming at -1.5 lands safely under the -1.0 gate.
  const target = { I: cfg.loudness.targetLufs, TP: cfg.loudness.truePeakMaxDb - 0.5, LRA: 11 };
  const meas = await measure(inAbs, target);
  if (!meas) throw new Error('loudnorm analysis produced no measurement (filter missing?)');
  const apply = [
    `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`,
    `measured_I=${meas.measured_I}`, `measured_TP=${meas.measured_TP}`,
    `measured_LRA=${meas.measured_LRA}`, `measured_thresh=${meas.measured_thresh}`,
    `offset=${meas.offset}`, 'linear=true', 'print_format=summary',
  ].join(':');
  const r = await run(REMOTION, ['ffmpeg', '-hide_banner', '-nostats', '-y', '-i', inAbs,
    '-map', '0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', String(cfg.video.sampleRate),
    '-ac', String(cfg.video.channels), '-af', apply, outAbs]);
  if (r.code !== 0) throw new Error('loudnorm apply failed: ' + r.stderr.trim().split('\n').slice(-3).join(' '));
  return { before: meas.measured_I, target: target.I };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const inRel = process.argv[2];
  if (!inRel) { console.error('Usage: node scripts/pipeline/normalize.mjs <in.mp4> [out.mp4]'); process.exit(1); }
  const inAbs = path.isAbsolute(inRel) ? inRel : path.join(ROOT, inRel);
  const outAbs = process.argv[3]
    ? (path.isAbsolute(process.argv[3]) ? process.argv[3] : path.join(ROOT, process.argv[3]))
    : inAbs.replace(/\.mp4$/, '.norm.mp4');
  const cfg = await loadConfig();
  console.log(`Normalizing → ${cfg.loudness.targetLufs} LUFS (two-pass loudnorm)…`);
  const { before, target } = await normalizeLoudness(inAbs, outAbs, cfg);
  console.log(`✓ ${before} LUFS → ${target} LUFS   ${path.relative(ROOT, outAbs)}`);
}
