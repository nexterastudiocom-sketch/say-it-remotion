#!/usr/bin/env node
// Command 6 · generate the images the registry declares. Reads registry.json,
// generates every entry that still needs a picture (status pending, or rejected
// with a regeneration note), saves the PNG under public/, and marks it
// `generated` — awaiting contact-sheet approval before it may reach render (I-11).
//
//   node --env-file=.env scripts/images/generate.mjs [--only <key>] [--limit N] [--regen]
//
// Style: the locked ligne-claire look (style-lock.mjs), prompt-driven. Identity
// consistency is the registry's job (one file per item); style consistency is the
// prompt's. Never generates a second file for an item that already has one.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage } from '../recraft-client.mjs';
import { stylePrompt } from '../style-lock.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const regen = args.includes('--regen');

const regPath = path.join(ROOT, 'assets/images/registry.json');
if (!existsSync(regPath)) { console.error('✗ no registry — run scripts/images/registry.mjs first'); process.exit(1); }
const reg = JSON.parse(await readFile(regPath, 'utf8'));

// Flatten items + scenes into one work list, tagged by class.
const all = [
  ...Object.entries(reg.items).map(([key, e]) => ({ cls: 'item', key, e })),
  ...Object.entries(reg.scenes).map(([key, e]) => ({ cls: 'scene', key, e })),
];
const needs = (e) => e.status === 'pending' || (regen && e.status === 'rejected');
let queue = all.filter(({ key, e }) => needs(e) && (!only || key === only));
queue = queue.slice(0, limit);

if (!queue.length) { console.log('nothing to generate (all approved/generated).'); process.exit(0); }
console.log(`▶ generating ${queue.length} image(s) in the locked style…`);

let ok = 0, fail = 0;
for (const { cls, key, e } of queue) {
  // A rejected entry regenerates from its reject note appended to the brief.
  const brief = e.reject_note ? `${e.brief}. ${e.reject_note}` : e.brief;
  const prompt = stylePrompt(brief);
  const outAbs = path.join(ROOT, 'public', e.file);
  try {
    await mkdir(path.dirname(outAbs), { recursive: true });
    const [url] = await generateImage({ prompt, model: 'recraftv3', style: 'digital_illustration', size: '1024x1024', n: 1 });
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(outAbs, buf);
    e.status = 'generated';
    e.reject_note = undefined;
    ok++;
    console.log(`  ✓ ${cls} ${key} → ${e.file} (${(buf.length / 1024) | 0}KB)`);
  } catch (err) {
    fail++;
    console.log(`  ✗ ${cls} ${key} — ${err.message.slice(0, 120)}`);
  }
}
await writeFile(regPath, JSON.stringify(reg, null, 2) + '\n');
console.log(`done — ${ok} generated, ${fail} failed. Review build/<id>/contact_sheet.html, then approve.`);
