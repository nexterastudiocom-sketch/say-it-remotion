#!/usr/bin/env node
// Render the Mosaic YouTube thumbnail for a lesson → out/thumbnails/<id>.png.
// Derives the props from the baked lesson + image registry so the loop can make
// one per lesson with no hand-tuning.
//   node scripts/thumbnail.mjs <id>
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] || 'lesson-01';
const lesson = JSON.parse(await readFile(path.join(ROOT, `src/data/lessons/${id}.method.json`), 'utf8'));
const meta = lesson.meta || {};
const items = meta.items || [];

// Hero phrase = first two taught items ("Bonjour" / "salut…") — the marquee for a
// browse-size grid. Sub-line = the English can-do, trimmed to one short clause.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const line1 = cap((items[0] || 'Bonjour').toString());
const line2 = items[1] ? `${items[1]}…` : '…';
// One short clause only (design: the sub-line never wraps past two lines).
const subtitle = cap((meta.can_do || 'Speak from day one').replace(/^I can\s+/i, '').split(/[,;]/)[0].replace(/\.$/, '').trim());
const level = meta.level || 'A1';
const language = meta.language || 'fr';

// Image slot = the first item's approved/generated registry illustration, if any.
let imageSrc;
const regPath = path.join(ROOT, 'assets/images/registry.json');
if (existsSync(regPath)) {
  const reg = JSON.parse(await readFile(regPath, 'utf8'));
  const e = reg.items?.[items[0]];
  if (e && existsSync(path.join(ROOT, 'public', e.file))) imageSrc = e.file;
}

const props = { language, level, line1, line2, subtitle, ...(imageSrc ? { imageSrc } : {}) };
await mkdir(path.join(ROOT, 'out/thumbnails'), { recursive: true });
const out = path.join(ROOT, `out/thumbnails/${id}.png`);
const bin = path.join(ROOT, 'node_modules/.bin/remotion');
console.log(`▶ thumbnail ${id}:`, JSON.stringify(props));
execFileSync(bin, ['still', 'Thumbnail', out, `--props=${JSON.stringify(props)}`], { cwd: ROOT, stdio: 'inherit' });
console.log(`✓ ${path.relative(ROOT, out)}`);
