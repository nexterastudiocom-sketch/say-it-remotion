#!/usr/bin/env node
// GATE B · I-08 (L3) — progress indicator present and monotonically increasing. Standalone.
//   node scripts/qa/gate-b-i08.mjs <video-id>
// Sample frames across the lesson, OCR, read the "N words learned" progress chip,
// assert it never decreases. OCR (not a vision model).
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { paths, run, ffmpegStatic, REMOTION, ROOT, videoDuration } from './lib.mjs';
import { rules, finding, merge } from './gateb.mjs';

const id = process.argv[2] || 'lesson-01';
const OCR_PY = path.join(ROOT, '.venv-ocr/bin/python');
const P = paths(id);
if (!existsSync(P.video)) { console.error('✗ no render'); process.exit(2); }
const Y = await rules();
const dur = await videoDuration(P.video);
const times = []; for (let t = 8; t < dur - 4; t += 25) times.push(+t.toFixed(1));
const ff = ffmpegStatic() || REMOTION; const ffPre = ff === REMOTION ? ['ffmpeg'] : [];
const dir = path.join(ROOT, `build/${id}/frames-i08`); mkdirSync(dir, { recursive: true });
const frames = [];
for (const t of times) { const fp = path.join(dir, `t${t}.png`); const r = await run(ff, [...ffPre, '-hide_banner', '-nostats', '-y', '-ss', String(t), '-i', P.video, '-frames:v', '1', '-q:v', '2', fp]); if (r.code === 0) frames.push([t, fp]); }
const ocrR = await run(OCR_PY, [path.join(ROOT, 'scripts/qa/ocr.py'), ...frames.map((f) => f[1])]);
const ocr = ocrR.code === 0 ? JSON.parse(ocrR.stdout) : {};
const series = [];
for (const [t, fp] of frames) { const boxes = ocr[fp]; if (!Array.isArray(boxes)) continue; const txt = boxes.map((b) => b.text).join(' '); const m = txt.match(/(\d+)\s*(?:words?\s*learned|\/\s*\d+)/i) || txt.match(/learned[^0-9]*(\d+)/i); if (m) series.push([t, +m[1]]); }
const F = [];
if (!series.length) F.push(finding(Y, 'I-08', 0, 'no progress indicator detected on any sampled frame', ''));
else for (let i = 1; i < series.length; i++) if (series[i][1] < series[i - 1][1]) F.push(finding(Y, 'I-08', 0, `progress decreased ${series[i - 1][1]}→${series[i][1]} between ${series[i - 1][0]}s and ${series[i][0]}s`, ''));
await merge(id, ['I-08'], F, { progress_series: series.length });
console.log(`GATE B · I-08 — ${series.length}/${frames.length} frames showed progress (${series.map((s) => s[1]).join('→')})`);
console.log(F.length ? '  ⚠ ' + F[0].issue : '  ✓ progress present and monotonic.');
process.exit(0); // I-08 is WARN
