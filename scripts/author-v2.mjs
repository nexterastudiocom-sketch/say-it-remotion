#!/usr/bin/env node
// author-v2 — FULL-RESCHEDULE Method v2 author. Unlike v1 (fixed stage backbone),
// the drill sequence here is ordered ENTIRELY by the expanding-interval spacing
// engine (scripts/qa/spacing.mjs). Structure follows the measured method:
//
//   cold_open → preview → [drills, spacing-engine-ordered] → checkpoint×3 → close
//
//   node scripts/author-v2.mjs <workbook.xlsx>
//
// Emits the SAME md grammar as v1 (so the existing parser/builder/gates apply) but
// with v2 ordering. Production pauses are placeholders here — build-method-lesson
// recomputes each from the MEASURED model clip (method v2 dynamic pause).

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { scheduleItems, validateSchedule, spacingTable, SPACING_SPEC } from './qa/spacing.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = process.argv[2];
if (!xlsxPath) { console.error('usage: node scripts/author-v2.mjs <workbook.xlsx>'); process.exit(2); }

// ---- read workbook ----------------------------------------------------------
const wb = XLSX.readFile(xlsxPath);
const J = (n) => (wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }) : []);
const brief = {};
for (const r of XLSX.utils.sheet_to_json(wb.Sheets['Lesson_Brief'], { header: 1, defval: '' }))
  if (r[0] && r[1] && r[0] !== 'Field') brief[String(r[0]).trim()] = String(r[1]).trim();

const stripGender = (s) => String(s).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
const noDots = (s) => String(s).replace(/\s*(?:\.\.\.|…)\s*/g, '. ').replace(/\.\s*\.\s*/g, '. ').trim();

const items = J('Items').filter((r) => r.fr).map((r) => ({
  fr: stripGender(r.fr), gloss: String(r.en).trim(), phon: String(r.phonetic).trim(),
  note: String(r.form_note || r['form_note (the ONE hardest thing)'] || '').trim(),
  level: Number(String(r.target_level).replace(/\D/g, '')) || 3,
  // core = the items the lesson leans on (harder / higher target level).
  core: (Number(String(r.target_level).replace(/\D/g, '')) || 3) >= 4,
}));
const S = J('Sentences');
const byRole = (role) => S.filter((r) => r.role === role);
const build = byRole('BUILD_STEP').map((r) => ({ step: Number(r.build_step) || 0, sentence: noDots(r.fr), mark: String(r.slot_changed).trim() }));
const fluency = byRole('FLUENCY').map((r) => noDots(r.fr));
const dialogue = J('Dialogue').filter((r) => r.fr).map((r) => [String(r.speaker).trim(), noDots(r.fr)]);

const num = Number(brief.lesson) || 1;
const id = (process.env.MOSAIC_LESSON_ID || path.basename(xlsxPath).replace(/\.xlsx$/i, '')).trim();

// English gloss for a French item (first sense only).
const glossOf = (fr) => (items.find((x) => x.fr === fr)?.gloss || fr).split('/')[0].trim();

// EN beats must NEVER say a taught French word (V-07): replace any item with its gloss.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const enSafe = (text) => {
  let t = String(text);
  for (const o of items.slice().sort((a, b) => b.fr.length - a.fr.length))
    t = t.replace(new RegExp(`\\b${esc(o.fr)}\\b`, 'gi'), o.gloss.split('/')[0].trim());
  return t;
};
// Proper names in the dialogue → declared so V-01 allows them.
const FR_STOP = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'et', 'ça', 'va', 'bien', 'comment', 'oui', 'non', 'merci', 'bonjour', 'bonsoir', 'salut', 'madame', 'monsieur', 'pardon', 'le', 'la', 'les', 'un', 'une', 'de', 'du', 'à', 'est', 'moi', 'toi', 'revoir', 'appelle', 'comme', 'ci', 'très', 'aussi']);
// Proper nouns (character names AND place names like Paris/France) appear across
// dialogue, build-up sentences and fluency lines — scan ALL emitted French so V-01
// allows them without teaching them. A capitalised, non-sentence-initial token that
// isn't a common French word is a proper noun.
const properNouns = (texts) => [...new Set(texts.flatMap((t) => String(t).split(/[.!?—:;,]/).flatMap((seg) => seg.trim().split(/\s+/).map((w, i) => ({ w: w.replace(/[^A-Za-zÀ-ÿ'’-]/g, ''), i })).filter(({ w, i }) => i > 0 && /^[A-ZÀ-Ÿ][a-zà-ÿ]+$/.test(w) && !FR_STOP.has(w.toLowerCase())).map(({ w }) => w))))];
const names = properNouns([...dialogue.map((d) => d[1]), ...build.map((b) => b.sentence), ...fluency]);

// ---- spacing schedule -------------------------------------------------------
const schedItems = items.map((i) => ({ ref: i.fr, core: i.core }));
const sched = scheduleItems(schedItems);
const val = validateSchedule(sched, schedItems);

// ---- emit -------------------------------------------------------------------
const out = [];
const w = (s = '') => out.push(s);
const img = (t) => w(`  🖼 ${t}`);
const beat = (voice, phase, level, text, pause, { rate, extra } = {}) => {
  const tags = [`[${phase}]`, `[L${level}]`, ...(extra || [])].join(' ');
  w(`  ${voice} ${tags} → ${voice.startsWith('FR') && rate ? `[rate: ${rate}] ${text}` : text}`);
  if (pause != null) w(`    ⏸ PAUSE ${pause}s`);
};
let seg = 0;
const section = (stage, label) => { w(); w(`## ${String(++seg).padStart(2, '0')} · ${stage}${label ? ' · ' + label : ''}`); };

// frontmatter
w('---');
w(`lesson: ${num}`);
w('language: fr');
w('method_version: 2');
w(`level: ${brief.level || 'A1'}`);
if (brief.class) w(`class: ${brief.class}`);
w(`title: ${JSON.stringify(brief.topic_neutral || brief.title || '')}`);
w(`can_do: ${JSON.stringify(brief.can_do || '')}`);
w(`items: [${items.map((i) => JSON.stringify(i.fr)).join(', ')}]`);
w(`glosses: [${items.map((i) => JSON.stringify(i.gloss.split('/')[0].trim())).join(', ')}]`);
if (names.length) w(`names: [${names.map((n) => JSON.stringify(n)).join(', ')}]`);
if (brief.frame) w(`frame: ${JSON.stringify(brief.frame)}`);
w('---');
w();
w(`<!-- Generated from ${path.basename(xlsxPath)} by scripts/author-v2.mjs (method v2, full reschedule).`);
w(`     Drill order = expanding-interval spacing engine. Pauses recomputed from measured audio. -->`);

// Dialogue voice is fixed per speaker so the SAME line always resolves to the SAME
// cached clip across cold-open, checkpoints and close (S-08 byte-identity).
const dlgVoice = (sp) => (String(sp)[0] === 'A' ? 'FR·WOMAN' : 'FR·MAN');

// A real, lesson-related image for the cold open — reuse an EXISTING item image.
// Prefer a greeting/"hello" item (the most on-topic opener), else first core item.
const coldItem = (items.find((i) => /\b(hello|hi|good (morning|day|evening))\b/i.test(i.gloss)) || items.find((i) => i.core) || items[0]).fr;

// 1) COLD OPEN — one line, a related image, then the dialogue at natural speed.
section('COLD_INPUT', 'cold open');
img(`ILLUSTRATION — ${coldItem}`);
beat('EN·WOMAN', 'INPUT', 3, 'Listen to this conversation.', '0.6');
for (const [sp, line] of dialogue) beat(dlgVoice(sp), 'INPUT', 3, line, '0.3', { rate: 'natural' });

// (No preview / translation block — words are introduced in the drills below.)

// 2) DRILLS — spacing-engine order. EACH item recall is its OWN slide so the word
// card on screen ALWAYS matches the word in the voice (the old single-slide drill
// showed one card while the audio cycled 12 words). First appearance = listen &
// repeat (introduces it); later = produce from meaning. Checkpoints inject at the
// measured positions 0.30 / 0.53 / 0.83.
const totalSlots = sched.slots;
const cpThresholds = [0.30, 0.53, 0.83].map((f) => Math.round(totalSlots * f));
let cpDone = 0;
const bySlot = [...sched.schedule].sort((a, b) => a.slot - b.slot);
const exposures = new Map(); // fr → how many times drilled (rate ramps slow→natural)
let dn = 0;
for (const appt of bySlot) {
  if (cpDone < cpThresholds.length && appt.slot >= cpThresholds[cpDone]) {
    cpDone++;
    section('INPUT_RETURN', `checkpoint ${cpDone} — the whole exchange, twice`);
    for (let pass = 1; pass <= 2; pass++) {
      beat('EN·WOMAN', 'RECALL', 3, pass === 1 ? 'The whole conversation — say each line back.' : 'Again — say it with them.', '0.6');
      // Same voice + natural rate as the cold open → byte-identical clips (S-08).
      for (const [sp, line] of dialogue) beat(dlgVoice(sp), 'RECALL', 3, line, '2.0', { rate: 'natural', extra: ['[confirm]'] });
    }
  }
  const it = items.find((x) => x.fr === appt.ref);
  const voice = it.core ? 'FR·MAN' : 'FR·WOMAN';
  const g = enSafe(it.gloss.split('/')[0].trim());
  const n = (exposures.get(it.fr) || 0) + 1;
  exposures.set(it.fr, n);
  const rate = n < 3 ? 'slow' : 'natural'; // slow for the first 2 exposures (R-03)
  // OWN slide per item → the word card is THIS item, matching the FR audio.
  section('ITEM_BLOCK', it.fr);
  img(`ILLUSTRATION — ${it.fr}`);
  if (n === 1) {
    // Introduce: hear it, then repeat it (slow); the model confirms.
    beat('EN·MAN', 'ECHO', it.level, 'Listen, then repeat.', '0.5');
    beat(voice, 'ECHO', it.level, it.fr, '2.0', { rate, extra: ['[confirm]'] });
  } else {
    // Produce from meaning. Cues lean to "repeat / now you" (never say the French).
    const CUES = [`Your turn — say "${g}".`, `Repeat it in French — "${g}".`, `Now you — "${g}".`, `Say "${g}".`, `Your turn — "${g}".`];
    beat('EN·MAN', 'PRODUCE', it.level, CUES[dn % CUES.length], '3.5');
    beat(voice, 'PRODUCE', it.level, it.fr, '1.0', { rate, extra: ['[confirm]'] });
    dn++;
  }
}

// 4) BUILD LADDER — backward build-up chains (tail-first), one rung per slot.
if (build.length) {
  section('BUILD_LADDER', 'put it together');
  // The EN voice NEVER reads the French sentence (V-07). It gives a French-free
  // cue; the learner assembles from the pieces already drilled, then the FR model
  // confirms. The changed chunk is signalled visually (chunk bar), not spoken.
  build.sort((a, c) => a.step - c.step).forEach((b, i) => {
    img(`CHUNK BAR — HIGHLIGHT ${b.mark || 'new chunk'}`);
    beat('EN·MAN', 'BUILD', 3, i === 0 ? 'Now put the pieces together — say the whole line.' : 'Add the next piece — say the whole line.', '3.5');
    beat('FR·MAN', 'BUILD', 3, b.sentence, '1.0', { rate: 'natural', extra: ['[confirm]'] });
  });
}

// 5) FLUENCY — say the whole thing, faster each pass.
if (fluency.length) {
  section('FLUENCY_ROUND', 'fluency');
  for (let pass = 1; pass <= 2; pass++) {
    beat('EN·WOMAN', 'RECALL', 3, `Pass ${pass}. ${pass === 1 ? 'Take your time.' : 'A little quicker.'}`, '0.6');
    for (const s of fluency) beat('FR·MAN', 'RECALL', 3, s, '2.5', { rate: pass === 1 ? 'slow' : 'natural', extra: [`[fluency: ${pass}]`] });
  }
}

// 6) CLOSE — the dialogue once more, unassisted.
section('CAN_DO_CHECK', 'close — you can do this now');
beat('EN·WOMAN', 'RECALL', 3, 'Last time. The whole exchange — say each line before they do.', '0.8');
for (const [sp, line] of dialogue) beat(dlgVoice(sp), 'RECALL', 3, line, '2.0', { rate: 'natural', extra: ['[confirm]'] });

// ---- write ------------------------------------------------------------------
await mkdir(path.join(ROOT, 'lessons'), { recursive: true });
await writeFile(path.join(ROOT, `lessons/${id}.md`), out.join('\n') + '\n');

// spacing table into the QA area for review
await mkdir(path.join(ROOT, `build/${id}`), { recursive: true });
await writeFile(path.join(ROOT, `build/${id}/spacing.txt`),
  `EXPANDING-INTERVAL SCHEDULE — ${items.length} items → ${sched.slots} response slots\n\n${spacingTable(sched, schedItems)}\n\n${val.ok ? '✓ schedule valid' : '✗ ' + val.violations.join('\n  ')}\n`);

console.log(`✓ lessons/${id}.md  (v2 full reschedule)`);
console.log(`  ${items.length} items → ${sched.slots} slots, ${dialogue.length}-line dialogue, ${build.length} build rungs, 3 checkpoints`);
console.log(`  spacing: ${val.ok ? '✓ valid' : '✗ ' + val.violations.length + ' violations'} — build/${id}/spacing.txt`);
if (!val.ok) { console.error('  ✗ spacing schedule invalid:\n    ' + val.violations.join('\n    ')); process.exit(1); }
