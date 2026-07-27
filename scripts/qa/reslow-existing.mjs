#!/usr/bin/env node
// One-off: slow the already-synthesized FRENCH clips to the new RATE_ATEMPO
// targets without paying for a re-bake. The existing clips were generated at the
// OLD ElevenLabs speed per rate; we apply a corrective atempo = target / old so
// each lands at the intended fraction of real speed. English clips are untouched.
//   node scripts/qa/reslow-existing.mjs <id>
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';

const require = createRequire(import.meta.url);
const FF = require('ffmpeg-static');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const id = process.argv[2] || 'lesson-01';

const OLD_SPEED = { very_slow: 0.7, slow: 0.85, natural: 1.0, fast: 1.15 };
const TARGET = { very_slow: 0.5, slow: 0.55, natural: 0.75, fast: 0.85 };
const correction = (rate) => (TARGET[rate] ?? 0.75) / (OLD_SPEED[rate] ?? 1.0);

const atempo = (fileAbs, ratio) => {
  const factors = []; let r = ratio;
  while (r < 0.5) { factors.push(0.5); r /= 0.5; } factors.push(r);
  const tmp = fileAbs.replace(/\.mp3$/, '.slow.mp3');
  execFileSync(FF, ['-y', '-hide_banner', '-nostats', '-i', fileAbs, '-af', factors.map((f) => `atempo=${f.toFixed(4)}`).join(','), tmp], { stdio: 'pipe' });
  return tmp;
};

const jsonPath = path.join(ROOT, `src/data/lessons/${id}.method.json`);
const lesson = JSON.parse(await readFile(jsonPath, 'utf8'));

// One corrective stretch per unique French clip file (keyed by src → rate).
const doneFor = new Map(); // src → new duration
let stretched = 0;
for (const s of lesson.slides) for (const b of s.beats || []) {
  if (!b.src || !b.voice || !b.voice.startsWith('fr')) continue;
  if (!doneFor.has(b.src)) {
    const abs = path.join(ROOT, 'public', b.src);
    if (!existsSync(abs)) { doneFor.set(b.src, b.durationInSeconds); continue; }
    const ratio = correction(b.rate);
    try { const tmp = atempo(abs, ratio); await writeFile(abs, await readFile(tmp)); await rm(tmp, { force: true }); stretched++; } catch { /* keep original */ }
    doneFor.set(b.src, +(((await parseFile(abs)).format.duration) || b.durationInSeconds).toFixed(2));
  }
  b.durationInSeconds = doneFor.get(b.src);
}
for (const s of lesson.slides) s.durationInSeconds = +(s.beats || []).reduce((a, x) => a + x.durationInSeconds, 0).toFixed(2);
await writeFile(jsonPath, JSON.stringify(lesson, null, 2) + '\n');
const total = lesson.slides.reduce((a, s) => a + s.durationInSeconds, 0);
console.log(`✓ reslowed ${stretched} French clips → ${id}.method.json — new length ${Math.floor(total / 60)}m${Math.round(total % 60)}s`);
