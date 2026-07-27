#!/usr/bin/env node
// Inject registry images into an already-baked Method lesson — no re-synthesis.
// Lets us add/refresh illustrations after the audio bake without paying for TTS.
//   node scripts/images/bind.mjs <id> [--strict]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindImages } from './bind-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const id = process.argv[2] || 'lesson-01';
const strict = process.argv.includes('--strict');
const jsonPath = path.join(ROOT, `src/data/lessons/${id}.method.json`);
if (!existsSync(jsonPath)) { console.error(`✗ no baked lesson: ${jsonPath}`); process.exit(1); }

const lesson = JSON.parse(await readFile(jsonPath, 'utf8'));
const n = lesson.meta?.lesson || Number(id.replace(/\D/g, '')) || 1;
// Clear any stale bindings first so removed/rejected images drop out.
for (const s of lesson.slides) { delete s.imageSrc; delete s.item; delete s.imageId; delete s.wantsImage; for (const b of s.beats || []) { delete b.imageSrc; delete b.wantsImage; } }
const { bound, wanted } = await bindImages(lesson.slides, n, ROOT, { strict });
await writeFile(jsonPath, JSON.stringify(lesson, null, 2) + '\n');
console.log(`✓ ${id}.method.json — ${bound}/${wanted} image slots filled, ${wanted - bound} show No-Credit${strict ? ' (strict: approved-only)' : ''}`);
