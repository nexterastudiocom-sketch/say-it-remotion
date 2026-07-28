#!/usr/bin/env node
// author-from-excel — read a Mosaic lesson workbook (.xlsx) and emit the
// conformant Method-grammar transcript (lessons/<id>.md). Same structure and
// P(beat) timing as the golden lesson; content comes entirely from the sheets.
//
//   node scripts/author-from-excel.mjs <workbook.xlsx>
//
// Sheets: Lesson_Brief · Items · Sentences · Dialogue · Scenarios (per the template).

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { frSyllables, pBeat, timing } from './qa/pbeat.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = await timing();
const P = (role, text, opts) => pBeat(role, text, cfg, opts).toFixed(1);
const xlsxPath = process.argv[2];
if (!xlsxPath) { console.error('usage: node scripts/author-from-excel.mjs <workbook.xlsx>'); process.exit(2); }

// ---- read sheets -----------------------------------------------------------
const wb = XLSX.readFile(xlsxPath);
const J = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
const brief = {};
for (const r of XLSX.utils.sheet_to_json(wb.Sheets['Lesson_Brief'], { header: 1, defval: '' }))
  if (r[0] && r[1] && r[0] !== 'Field') brief[String(r[0]).trim()] = String(r[1]).trim();
const items = J('Items').filter((r) => r.fr).map((r) => ({
  fr: String(r.fr).trim(), gloss: String(r.en).trim(), phon: String(r.phonetic).trim(),
  note: String(r.form_note || r['form_note (the ONE hardest thing)'] || '').trim(),
  level: Number(String(r.target_level).replace(/\D/g, '')) || 3,
  chunked: /^y/i.test(String(r.chunked_echo)),
}));
const S = J('Sentences');
const byRole = (role) => S.filter((r) => r.role === role);
// A dramatic "..." pause inside a produced sentence reads as a syllable split
// at natural rate (R-02). Strip it from produced (non-dialogue) FR sentences.
const noDots = (s) => String(s).replace(/\s*(?:\.\.\.|…)\s*/g, '. ').replace(/\.\s*\.\s*/g, '. ').trim();
const build = byRole('BUILD_STEP').map((r) => ({ step: `step ${String(r.build_step).trim()}`, sentence: noDots(r.fr), mark: String(r.slot_changed).trim(), tryFirst: /^y/i.test(String(r.try_first)) }));
const miyModel = Object.fromEntries(byRole('MIY_MODEL').map((r) => [String(r.id).trim(), noDots(r.fr)]));
const transferModel = noDots((byRole('TRANSFER_MODEL')[0] || {}).fr || '');
const fluency = byRole('FLUENCY').map((r) => noDots(r.fr));
const dialogue = J('Dialogue').filter((r) => r.fr).map((r) => [String(r.speaker).trim(), String(r.fr).trim()]);
const scenarios = J('Scenarios').filter((r) => r.n).map((r) => ({
  situation: String(r['situation (English, target NOT named)'] || r.situation || Object.values(r)[1]).trim(),
  personal: /^y/i.test(String(r.personalized)),
  bank: String(r['word_bank (English glosses)'] || r.word_bank || '').trim(),
  model: miyModel[String(r.model_sentence_id).trim()] || '',
}));
const num = Number(brief.lesson) || 1;
const id = `lesson-${String(num).padStart(2, '0')}`;

// A form note that names ANOTHER item trips X-04's substring check (a mention is
// not a support level). Neutralize other-item names to their English gloss.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const neutralize = (note, self) => {
  let t = String(note);
  for (const o of items.filter((x) => x.fr !== self).sort((a, b) => b.fr.length - a.fr.length))
    t = t.replace(new RegExp(`\\b${esc(o.fr)}\\b`, 'gi'), o.gloss.split('/')[0].trim());
  return t;
};

// ---- emit ------------------------------------------------------------------
const out = [];
const w = (s = '') => out.push(s);
const img = (t) => w(`  🖼 ${t}`);
const beat = (voice, phase, level, text, pause, { rate, extra } = {}) => {
  const tags = [`[${phase}]`, `[L${level}]`, ...(extra || [])].join(' ');
  w(`  ${voice} ${tags} → ${voice.startsWith('FR') && rate ? `[rate: ${rate}] ${text}` : text}`);
  if (pause != null) w(`    ⏸ PAUSE ${pause}s`);
};
const seg = (nn, stage, label) => { w(); w(`## ${nn} · ${stage}${label ? ' · ' + label : ''}`); };
const step = (s) => w(`### ${s}`);
const itemsList = items.map((i) => (i.fr.includes(' ') || i.fr.includes("'") ? `"${i.fr}"` : i.fr)).join(', ');

w('---');
w(`lesson: ${num}`); w(`language: ${brief.language || 'fr'}`); w(`level: ${brief.level || 'A1'}`);
w(`class: ${brief.class || 'CALIBRATION'}`);
// Header subtitle — ENGLISH/neutral topic, never a taught French word (it is on
// screen during retrieval; a taught word here leaks the answer, X-06/I-05).
if (brief.lesson_title) w(`title: "${String(brief.lesson_title).replace(/"/g, "'")}"`);
w(`can_do: "${(brief.can_do || '').replace(/"/g, "'")}"`);
w(`items: [${itemsList}]`);
w(`frame: "${(brief.frame || '').replace(/"/g, "'")}"`);
w('---'); w();
w(`<!-- Generated from ${path.basename(xlsxPath)} by scripts/author-from-excel.mjs.`);
w('     Method grammar; pauses computed via P(beat). Do not hand-edit — edit the workbook. -->');

// 01 CAN_DO_GOAL
seg('01', 'CAN_DO_GOAL'); img('GOAL CARD — can-do text');
beat('EN·MAN', 'MEET', 3, `By the end you can ${(brief.can_do || '').replace(/^I can /i, '').replace(/\.$/, '')}.`, '1.0');

// 02 WARM_UP
seg('02', 'WARM_UP');
beat('EN·WOMAN', 'RECALL', 3, num === 1 ? 'This is lesson one — nothing to bring back yet. Get ready to speak out loud.' : 'Warm up: say these from before, out loud.', '1.0');

// dialogue (shared COLD_INPUT / INPUT_RETURN)
const dlg = () => { for (const [v, t] of dialogue) beat(v, 'INPUT', 3, t, '0.4', { rate: 'natural' }); };
seg('03', 'COLD_INPUT');
beat('EN·MAN', 'INPUT', 3, 'Listen to two people meet and part. Understand what you can.', '0.8');
dlg();
if (brief.comprehension_q) beat('EN·MAN', 'INPUT', 3, `${brief.comprehension_q} Answer out loud, in English.`, '1.2');
if (brief.culture_note) beat('EN·MAN', 'NOTE', 3, brief.culture_note, '1.2');

// 04 ITEM_BLOCKS
for (const it of items) {
  seg('04', 'ITEM_BLOCK', it.fr);
  img(`WORD CARD — ${it.fr} · [${it.phon}] · illustration: ${it.gloss} · MIC`);
  beat('EN·MAN', 'MEET', 0, 'Listen. Don’t say anything yet.', '0.6');
  beat('FR·WOMAN', 'MEET', 0, it.fr, P('copy', it.fr), { rate: 'slow' });
  beat('EN·MAN', 'MEET', 0, it.gloss + '.', '0.8');
  if (it.note) beat('EN·MAN', 'MEET', 0, neutralize(it.note, it.fr), '0.8');
  beat('FR·WOMAN', 'MEET', 0, it.fr, P('copy', it.fr), { rate: 'slow' });
  // ECHO — chunked for long items, else simple
  beat('EN·MAN', 'ECHO', 1, 'Repeat after me.', '0.6');
  if (it.chunked && !it.fr.includes("'")) {
    const words = it.fr.split(/\s+/);
    let acc = '';
    for (const wd of words) { acc = (acc ? acc + ' ' : '') + wd; beat('FR·WOMAN', 'ECHO', 1, acc, P('copy', acc), { rate: 'very_slow' }); }
    beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'slow' });
  } else {
    beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'slow' });
    beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'slow' });
  }
  beat('EN·MAN', 'ECHO', 1, 'Repeat after me — normal speed this time.', '0.6');
  beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'natural' });
  img('MIC — no text on screen');
  beat('EN·MAN', 'PRODUCE', 3, `Your turn. Say "${it.gloss.split('/')[0].trim()}" in French.`, P('produce_meaning', it.fr));
  beat('FR·WOMAN', 'PRODUCE', 3, it.fr, '1.0', { rate: 'natural', extra: ['[confirm]'] });
  beat('EN·MAN', 'REPAIR', 3, 'Now you’ve heard it. Say it again.', (pBeat('produce_meaning', it.fr, cfg) * 0.8).toFixed(1));
}

// 05 MICRO_RECALL (groups of 3)
for (let g = 0; g < items.length; g += 3) {
  const chunk = items.slice(g, g + 3);
  seg('05', 'MICRO_RECALL');
  beat('EN·WOMAN', 'RECALL', 3, 'Quick check. I’ll say the French, you say the English.', '0.8');
  for (const c of chunk) beat('FR·MAN', 'RECALL', 3, c.fr, '2.0', { rate: 'slow' });
  beat('EN·WOMAN', 'RECALL', 3, 'Now the other way. Screen stays blank.', '0.8');
  for (const c of chunk) { beat('EN·WOMAN', 'RECALL', 3, `Now you — ${c.gloss.split('/')[0].trim()}.`, P('produce_meaning', c.fr)); beat('FR·MAN', 'RECALL', 3, c.fr, '1.0', { rate: 'natural', extra: ['[confirm]'] }); }
}

// 06 FRAME_INTRO
seg('06', 'FRAME_INTRO');
img(`CHUNK BAR — [ ${(brief.slots || 'greeting, person, courtesy').split(',').map((s) => s.trim()).join(' ][ ')} ] · empty slots`);
beat('EN·MAN', 'BUILD', 2, `A sentence with ${(brief.slots || '').split(',').length} slots: ${(brief.slots || '').trim()}.`, '1.0');

// 07 BUILD_LADDER
seg('07', 'BUILD_LADDER');
for (const b of build) {
  step(b.step);
  img(`CHUNK BAR — English slot labels · HIGHLIGHT the changed chunk (${b.mark})`);
  const final = b === build[build.length - 1];
  if (!b.tryFirst) beat('FR·WOMAN', 'BUILD', 1, b.sentence, '0.8', { rate: 'slow' });
  const tryLevel = final ? 4 : 2;
  beat('EN·MAN', 'BUILD', tryLevel, b.tryFirst ? 'Your turn — you build it.' : 'Your turn.', P(final ? 'produce_situation' : 'read_aloud', b.sentence));
  beat('FR·WOMAN', 'BUILD', 1, b.sentence, '1.0', { rate: 'natural', extra: ['[confirm]'] });
}

// 08 INPUT_RETURN (identical dialogue)
seg('08', 'INPUT_RETURN');
beat('EN·MAN', 'INPUT', 3, 'The same two people once more. Notice how much more you catch now.', '0.8');
dlg();

// 09 MAKE_IT_YOURS
seg('09', 'MAKE_IT_YOURS');
scenarios.forEach((sc, i) => {
  step(`scenario ${i + 1}`);
  img(`SCENE — ${sc.situation.slice(0, 40)} · WORD BANK: ${sc.bank} · MIC`);
  beat('EN·WOMAN', 'MAKE_IT_YOURS', 4, `${sc.situation} Say it out loud, then write it down.`, '12.0', { extra: ['[written]'] });
  beat('EN·WOMAN', 'MAKE_IT_YOURS', 4, 'Here is one way. If yours differs but the pieces fit, it’s right.', '0.8');
  if (sc.model) beat('FR·MAN', 'MAKE_IT_YOURS', 4, sc.model, '1.0', { rate: 'natural', extra: ['[confirm]'] });
});
// 10 TRANSFER_TASK
seg('10', 'TRANSFER_TASK');
img('BLANK — no words, no word bank · MIC · timer');
beat('EN·WOMAN', 'MAKE_IT_YOURS', 5, `${brief.transfer_situation || 'A new situation, nothing on screen.'} Say your reply.`, P('produce_cold', transferModel || 'Merci, monsieur.'));
if (transferModel) beat('FR·MAN', 'MAKE_IT_YOURS', 5, transferModel, '1.0', { rate: 'natural', extra: ['[confirm]'] });

// 11 FLUENCY_ROUND
seg('11', 'FLUENCY_ROUND');
for (const pass of [1, 2, 3]) {
  beat('EN·WOMAN', 'RECALL', 3, `Pass ${pass}. Same sentences, ${pass === 1 ? 'take your time' : pass === 2 ? 'a little quicker' : 'as fast as you can'}.`, '0.6');
  for (const s of fluency) beat('FR·MAN', 'RECALL', 3, s, P('fluency', s, { pass }), { rate: pass === 1 ? 'slow' : 'natural', extra: [`[fluency: ${pass}]`] });
}

// 12 CAN_DO_CHECK
seg('12', 'CAN_DO_CHECK'); img('SCORECARD — capability, not word count · progress');
if (brief.writing_note) beat('EN·WOMAN', 'NOTE', 3, brief.writing_note, '1.2');
beat('EN·WOMAN', 'RECAP', 3, `The question from the start: can you ${(brief.can_do || '').replace(/^I can /i, '').replace(/\.$/, '')}? Yes or no.`, '1.0');
beat('EN·WOMAN', 'RECAP', 3, `You can now ${(brief.can_do || '').replace(/^I can /i, '').replace(/\.$/, '')}.`, '0.8');
beat('EN·WOMAN', 'RECAP', 3, `These ${items.length} come back in your app in two days — say them, don’t just read them.`, '0.8');

await mkdir(path.join(ROOT, 'lessons'), { recursive: true });
await writeFile(path.join(ROOT, `lessons/${id}.md`), out.join('\n') + '\n', 'utf8');
console.log(`✓ lessons/${id}.md  (${out.length} lines · ${items.length} items · ${build.length} build steps · ${scenarios.length} scenarios · ${dialogue.length} dialogue lines)`);
