#!/usr/bin/env node
// Command 6 · image registry. Reads a lesson workbook and upserts
// assets/images/registry.json so every slide that needs a picture has a
// registry entry BEFORE generation.
//
//   node scripts/images/registry.mjs <workbook.xlsx>
//
// Two classes, two reuse rules (Command 6):
//   items  — keyed by the French item. Reused across EVERY lesson forever, so a
//            known item's entry is never overwritten (I-10: one image_id per item).
//   scenes — keyed by lesson_setting. Lesson-local; upserted each run.
//
// Status flow: pending (needs generation) → generated (file exists, awaiting
// review) → approved (may reach render, I-11) | rejected (regenerate from note).

import XLSX from 'xlsx';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const xlsxPath = process.argv[2] || path.join(ROOT, 'docs/templates/Say_It_Lesson_Input_Template.xlsx');
if (!existsSync(xlsxPath)) { console.error(`✗ no workbook: ${xlsxPath}`); process.exit(2); }

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

const wb = XLSX.readFile(xlsxPath);
const J = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
const brief = {};
for (const r of XLSX.utils.sheet_to_json(wb.Sheets['Lesson_Brief'], { header: 1, defval: '' }))
  if (r[0] && r[1] && r[0] !== 'Field') brief[String(r[0]).trim()] = String(r[1]).trim();
const lang = (brief.language || 'fr').toLowerCase();
const num = Number(brief.lesson) || 1;
const Lkey = `L${String(num).padStart(2, '0')}`;

const items = J('Items').filter((r) => r.fr).map((r) => ({
  fr: String(r.fr).trim(),
  gloss: String(r.en).trim(),
  brief: String(r.image_brief || '').trim(),
}));
const scenarios = J('Scenarios').filter((r) => r.n).map((r) => ({
  n: String(r.n).trim(),
  situation: String(r['situation (English, target NOT named)'] || r.situation || Object.values(r)[1] || '').trim(),
}));

// ---- load / seed registry ---------------------------------------------------
const regPath = path.join(ROOT, 'assets/images/registry.json');
await mkdir(path.dirname(regPath), { recursive: true });
const reg = existsSync(regPath) ? JSON.parse(await readFile(regPath, 'utf8')) : { items: {}, scenes: {} };
reg.items ??= {}; reg.scenes ??= {};

let added = 0, kept = 0;
// ITEMS — never overwrite a known item (cross-lesson identity).
for (const it of items) {
  if (reg.items[it.fr]) { kept++; continue; }
  const image_id = `img_${lang}_${slug(it.fr)}_01`;
  reg.items[it.fr] = {
    image_id,
    file: `assets/images/items/${image_id}.png`,
    brief: it.brief || it.gloss,
    gloss: it.gloss,
    status: 'pending',
    first_lesson: num,
    approved_at: null,
  };
  added++;
}

// SCENES — lesson-local. cold dialogue (reused at input return), culture note,
// each Make It Yours scenario, transfer task.
const upsertScene = (setting, brief_, kind, gloss) => {
  const key = `${Lkey}_${slug(setting)}`;
  if (reg.scenes[key] && reg.scenes[key].status === 'approved') { kept++; return; }
  const image_id = `img_${lang}_scene_${slug(`${Lkey}_${setting}`)}`;
  reg.scenes[key] = {
    image_id,
    file: `assets/images/scenes/${image_id}.png`,
    brief: brief_,
    gloss: gloss || kind,
    kind,
    lesson: num,
    status: reg.scenes[key]?.status || 'pending',
    approved_at: reg.scenes[key]?.approved_at || null,
  };
  added++;
};

const dialogueScene = 'Two people politely greeting each other and then parting at a small neighbourhood shop counter, one entering and one leaving';
upsertScene('cold_dialogue', dialogueScene, 'dialogue', 'Cold input dialogue (reused at input return)');
if (brief.culture_note) upsertScene('culture', `A scene illustrating: ${brief.culture_note}`, 'culture', 'Culture note');
for (const sc of scenarios) if (sc.situation) upsertScene(`scenario_${sc.n}`, `A scene showing: ${sc.situation}`, 'scenario', sc.situation);
if (brief.transfer_situation) upsertScene('transfer', `A scene showing: ${brief.transfer_situation}`, 'transfer', brief.transfer_situation);

await writeFile(regPath, JSON.stringify(reg, null, 2) + '\n');
const nItems = Object.keys(reg.items).length, nScenes = Object.keys(reg.scenes).length;
const pending = [...Object.values(reg.items), ...Object.values(reg.scenes)].filter((e) => e.status !== 'approved').length;
console.log(`✓ registry → assets/images/registry.json  (${nItems} items, ${nScenes} scenes · +${added} new, ${kept} kept · ${pending} not yet approved)`);
