#!/usr/bin/env node
// GATE B · S-08 (L2) — COLD_INPUT and INPUT_RETURN are byte-identical audio. Standalone.
//   node scripts/qa/gate-b-audio-identity.mjs <video-id>
// Extract each stage's audio span from the render (same codec params), hash, compare.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { paths, readJson, run, ffmpegStatic, REMOTION, ROOT } from './lib.mjs';
import { rules, finding, merge } from './gateb.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.video) || !existsSync(P.manifest)) { console.error('✗ need render + manifest'); process.exit(2); }
const Y = await rules();
const man = await readJson(P.manifest);
const span = (stage) => { const b = man.lines.filter((r) => r.stage === stage && r.audioAsset); if (!b.length) return null; return { start: Math.min(...b.map((x) => x.videoStart)), end: Math.max(...b.map((x) => x.videoEnd)) }; };
const cold = span('COLD_INPUT'), ret = span('INPUT_RETURN');
if (!cold || !ret) { console.log('GATE B · S-08 — COLD_INPUT/INPUT_RETURN stages not found (needs Method-grammar lesson)'); await merge(id, ['S-08'], []); process.exit(0); }

const ff = ffmpegStatic() || REMOTION; const ffPre = ff === REMOTION ? ['ffmpeg'] : [];
const dir = path.join(ROOT, `build/${id}`); mkdirSync(dir, { recursive: true });
async function grab(s, name) { const out = path.join(dir, `s08-${name}.wav`); await run(ff, [...ffPre, '-hide_banner', '-nostats', '-y', '-ss', String(s.start), '-to', String(s.end), '-i', P.video, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', out]); return existsSync(out) ? createHash('sha256').update(readFileSync(out)).digest('hex') : null; }
const h1 = await grab(cold, 'cold'), h2 = await grab(ret, 'return');
const F = [];
if (h1 && h2 && h1 !== h2) F.push(finding(Y, 'S-08', 0, `COLD_INPUT (${cold.start}-${cold.end}s) and INPUT_RETURN (${ret.start}-${ret.end}s) audio differ`, `sha256 ${h1.slice(0, 12)} ≠ ${h2.slice(0, 12)}`));
await merge(id, ['S-08'], F);
console.log(`GATE B · S-08 — cold ${cold.start}-${cold.end}s vs return ${ret.start}-${ret.end}s`);
console.log(F.length ? '  ✗ audio differs (must be identical)' : '  ✓ identical audio.');
process.exit(F.length ? 1 : 0);
