#!/usr/bin/env node
// One-off: apply the new silence-trim to already-synthesized Method clips (no
// ElevenLabs calls) and refresh the baked lesson's durations from the trimmed
// files. Lets us clear the T-07 dead-air block without paying for a re-bake.
//   node scripts/qa/trim-existing.mjs <id>
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
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
const dir = path.join(ROOT, 'public', 'assets', 'audio', id, 'method');
const th = '-40dB';
const filt =
  `silenceremove=start_periods=1:start_silence=0.08:start_threshold=${th}:detection=peak,` +
  `areverse,silenceremove=start_periods=1:start_silence=0.08:start_threshold=${th}:detection=peak,areverse`;

const files = (await readdir(dir)).filter((f) => f.endsWith('.mp3'));
let trimmed = 0, saved = 0;
for (const f of files) {
  const abs = path.join(dir, f);
  const before = (await parseFile(abs)).format.duration || 0;
  const tmp = abs.replace(/\.mp3$/, '.trim.mp3');
  try {
    execFileSync(FF, ['-y', '-hide_banner', '-nostats', '-i', abs, '-af', filt, tmp], { stdio: 'pipe' });
    await writeFile(abs, await readFile(tmp));
  } catch { /* keep original */ } finally { await rm(tmp, { force: true }); }
  const after = (await parseFile(abs)).format.duration || before;
  if (before - after > 0.05) { trimmed++; saved += before - after; }
}
console.log(`trimmed ${trimmed}/${files.length} clips, removed ${saved.toFixed(1)}s of dead air`);

// Refresh durations in the baked lesson from the trimmed clip files.
const jsonPath = path.join(ROOT, `src/data/lessons/${id}.method.json`);
const lesson = JSON.parse(await readFile(jsonPath, 'utf8'));
const durOf = new Map();
for (const slide of lesson.slides) {
  for (const b of slide.beats || []) {
    if (!b.src) continue;
    const abs = path.join(ROOT, 'public', b.src);
    if (!existsSync(abs)) continue;
    if (!durOf.has(b.src)) durOf.set(b.src, +(((await parseFile(abs)).format.duration) || b.durationInSeconds).toFixed(2));
    b.durationInSeconds = durOf.get(b.src);
  }
  slide.durationInSeconds = +slide.beats.reduce((a, x) => a + x.durationInSeconds, 0).toFixed(2);
}
await writeFile(jsonPath, JSON.stringify(lesson, null, 2) + '\n');
const total = lesson.slides.reduce((a, s) => a + s.durationInSeconds, 0);
console.log(`✓ refreshed ${jsonPath.split('/').pop()} — new lesson length ${Math.floor(total / 60)}m${Math.round(total % 60)}s`);
