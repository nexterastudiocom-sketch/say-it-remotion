#!/usr/bin/env node
// Emit the GOLDEN lesson — lesson_01.md "Dire bonjour" — to full Mosaic Method
// conformance (docs/Mosaic_Method_v1.md + grammar Part II). Content is authored
// as data; structure follows the Core Loop / Build Loop templates and EVERY
// pause is computed with P(beat). Re-run to regenerate. Gate A iterates on it.
//
//   node scripts/author-lesson-01.mjs   →  lessons/golden/lesson_01.md

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frSyllables, pBeat, timing } from './qa/pbeat.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = await timing();
const P = (role, text, opts) => pBeat(role, text, cfg, opts).toFixed(1);

// ── content ──────────────────────────────────────────────────────────────
const ITEMS = [
  { fr: 'bonjour', gloss: 'Hello, or good morning.', phon: 'bohn-ZHOOR', note: 'The "on" is nasal — let the air flow through your nose, not a hard N.', split: 'Bon... jour', img: 'a person waving in daylight' },
  { fr: 'salut', gloss: 'Hi, or bye. Casual, for friends, not your boss.', phon: 'sa-LU', note: 'The final t is silent.', split: 'Sa... lut', img: 'two friends greeting casually' },
  { fr: 'merci', gloss: 'Thank you.', phon: 'mair-SEE', note: 'Roll gently into the r from the back of the throat.', split: 'Mer... ci', img: 'a hand receiving a gift' },
  { fr: "s'il vous plaît", gloss: 'Please.', phon: 'seel-voo-PLEH', note: 'Three words, one smooth phrase; the final t is silent.', split: '', img: 'a polite request at a counter' },
  { fr: 'oui', gloss: 'Yes.', phon: 'WEE', note: 'One clean syllable, like the English "we".', split: '', img: 'a nod of agreement' },
  { fr: 'non', gloss: 'No.', phon: 'NOHN', note: 'Nasal here too — the n is barely touched.', split: '', img: 'a gentle shake of the head' },
  { fr: 'au revoir', gloss: 'Goodbye.', phon: 'oh-ruh-VWAHR', note: 'The r is uvular — from the back of the throat, not the tip of the tongue.', split: '', img: 'a person leaving through a doorway' },
  { fr: 'pardon', gloss: 'Excuse me, or sorry.', phon: 'par-DOHN', note: 'Nasal on the "on"; useful for bumping into someone.', split: 'Par... don', img: 'someone stepping aside politely' },
  { fr: 'à bientôt', gloss: 'See you soon.', phon: 'ah-byen-TOH', note: 'Two accent marks when you write it: à and ô.', split: '', img: 'a friendly wave goodbye' },
  { fr: 'madame', gloss: 'Ma’am — a polite word for a woman.', phon: 'ma-DAHM', note: 'Stress the second syllable.', split: '', img: 'a woman being addressed politely' },
  { fr: 'monsieur', gloss: 'Sir — a polite word for a man.', phon: 'muh-SYUH', note: 'Hardly any letters are sounded here — just say "muh-SYUH".', split: '', img: 'a man being addressed politely' },
  { fr: 'bonsoir', gloss: 'Good evening — the after-dark greeting.', phon: 'bohn-SWAHR', note: 'Same nasal "on" at the start.', split: 'Bon... soir', img: 'a greeting under evening lights' },
];

const out = [];
const w = (s = '') => out.push(s);
let LN = 0;
// beat emitters -------------------------------------------------------------
const img = (t) => w(`  🖼 ${t}`);
const beat = (voice, phase, level, text, pause, { rate, extra } = {}) => {
  const tags = [`[${phase}]`, `[L${level}]`, ...(extra || [])].join(' ');
  const body = voice.startsWith('FR') && rate ? `[rate: ${rate}] ${text}` : text;
  w(`  ${voice} ${tags} → ${body}`);
  if (pause != null) w(`    ⏸ PAUSE ${pause}s`);
};
const seg = (nn, stage, label) => { w(); w(`## ${nn} · ${stage}${label ? ' · ' + label : ''}`); };
const step = (s) => w(`### ${s}`);

// ── front matter ───────────────────────────────────────────────────────────
w('---');
w('lesson: 1');
w('language: fr');
w('level: A1');
w('class: CALIBRATION');
w('can_do: "I can greet someone and take my leave, choosing the right formality and time of day."');
w(`items: [bonjour, salut, merci, "s'il vous plaît", oui, non, au revoir, pardon, "à bientôt", madame, monsieur, bonsoir]`);
w('frame: "[greeting], [person]. [courtesy] !"');
w('---');
w();
w('<!-- GOLDEN LESSON · reference example for all future Mosaic lesson generation.');
w('     Authored to Mosaic_Method_v1.md. Every pause is computed via P(beat).');
w('     Regenerate with: node scripts/author-lesson-01.mjs -->');

// 01 CAN_DO_GOAL (pair T: EN·MAN + FR·WOMAN)
seg('01', 'CAN_DO_GOAL');
img('GOAL CARD — "Greet and take your leave" · can-do text');
beat('EN·MAN', 'MEET', 3, 'By the end you can greet someone and take your leave, choosing the right formality and the right time of day.', '1.0');

// 02 WARM_UP (pair P: EN·WOMAN + FR·MAN) — lesson 1 has nothing to retrieve; a single L3 activation
seg('02', 'WARM_UP');
beat('EN·WOMAN', 'RECALL', 3, 'This is lesson one, so there is nothing to bring back yet. Just get ready to speak out loud.', '1.0');

// Connected dialogue — used IDENTICALLY in COLD_INPUT (03) and INPUT_RETURN (08)
// so S-08 holds. Only the 12 items; long enough for the A1 20–40s input band.
const DIALOGUE = [
  ['FR·WOMAN', 'Bonjour, monsieur.'], ['FR·MAN', 'Bonjour, madame.'],
  ['FR·WOMAN', "S'il vous plaît, monsieur."], ['FR·MAN', 'Oui, madame. Merci.'],
  ['FR·WOMAN', 'Merci, monsieur. Au revoir.'], ['FR·MAN', 'Au revoir, madame.'],
  ['FR·MAN', 'Pardon, madame ! Bonsoir.'], ['FR·WOMAN', 'Bonsoir, monsieur. Pardon.'],
  ['FR·WOMAN', 'Salut !'], ['FR·MAN', 'Salut, madame ! Merci.'],
  ['FR·WOMAN', 'Au revoir, monsieur. À bientôt !'], ['FR·MAN', 'À bientôt, madame.'],
  ['FR·WOMAN', "Oui, s'il vous plaît. Merci."], ['FR·MAN', 'Merci, madame. Bonsoir !'],
];
seg('03', 'COLD_INPUT');
beat('EN·MAN', 'INPUT', 3, 'Listen to two people meet and part. Understand what you can — you are not expected to catch every word.', '0.8');
for (const [v, t] of DIALOGUE) beat(v, 'INPUT', 3, t, '0.4', { rate: 'natural' });
beat('EN·MAN', 'INPUT', 3, 'One question: did they meet in the morning or the evening? Answer out loud, in English.', '1.2');
beat('EN·MAN', 'INPUT', 3, 'Both — they greet with bonjour, then part with bonsoir as evening comes.', '0.8');

// 04 ITEM_BLOCKS (all consecutive — stage order must be monotonic for S-01)
ITEMS.forEach((it) => {
  seg('04', 'ITEM_BLOCK', it.fr);
  // MEET L0
  img(`WORD CARD — ${it.fr} · [${it.phon}] · illustration: ${it.img} · MIC`);
  beat('EN·MAN', 'MEET', 0, 'Listen. Don’t say anything yet.', '0.6');
  beat('FR·WOMAN', 'MEET', 0, it.fr, P('copy', it.fr), { rate: 'slow' });
  beat('EN·MAN', 'MEET', 0, it.gloss, '0.8');
  if (it.split) { img('SPLIT SYLLABLES — ' + it.split); beat('FR·WOMAN', 'MEET', 0, it.split, P('copy', it.fr), { rate: 'very_slow' }); }
  beat('EN·MAN', 'MEET', 0, it.note, '0.8');
  beat('FR·WOMAN', 'MEET', 0, it.fr, P('copy', it.fr), { rate: 'slow' });
  // ECHO L1
  beat('EN·MAN', 'ECHO', 1, 'Repeat after me.', '0.6');
  beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'slow' });
  beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'slow' });
  beat('EN·MAN', 'ECHO', 1, 'Repeat after me — normal speed this time.', '0.6');
  beat('FR·WOMAN', 'ECHO', 1, it.fr, P('copy', it.fr), { rate: 'natural' });
  // PRODUCE L3
  img('MIC — no text on screen');
  beat('EN·MAN', 'PRODUCE', 3, `Your turn. Say "${it.gloss.replace(/\.$/, '').toLowerCase()}" in French.`, P('produce_meaning', it.fr));
  beat('FR·WOMAN', 'PRODUCE', 3, it.fr, '1.0', { rate: 'natural', extra: ['[confirm]'] });
  // REPAIR L3 (no confirm — the retry is the endpoint)
  beat('EN·MAN', 'REPAIR', 3, 'Now you’ve heard it. Say it again.', (pBeat('produce_meaning', it.fr, cfg) * 0.8).toFixed(1));
});

// 05 MICRO_RECALL (pair P) — one per group of 3, all consecutive after the blocks.
for (let g = 0; g < ITEMS.length; g += 3) {
  const chunk = ITEMS.slice(g, g + 3);
  seg('05', 'MICRO_RECALL');
  beat('EN·WOMAN', 'RECALL', 3, 'Quick check. I’ll say the French, you say the English.', '0.8');
  for (const c of chunk) beat('FR·MAN', 'RECALL', 3, c.fr, '2.0', { rate: 'slow' }); // FR→EN: short pause, English answer
  beat('EN·WOMAN', 'RECALL', 3, 'Now the other way. Screen stays blank.', '0.8');
  for (const c of chunk) {
    beat('EN·WOMAN', 'RECALL', 3, `Now you — ${c.gloss.replace(/\.$/, '').toLowerCase()}.`, P('produce_meaning', c.fr)); // "now you" = produce cue
    beat('FR·MAN', 'RECALL', 3, c.fr, '1.0', { rate: 'natural', extra: ['[confirm]'] });
  }
}

// 06 FRAME_INTRO (pair T)
seg('06', 'FRAME_INTRO');
img('CHUNK BAR — [ greeting ][ person ][ courtesy ] · empty slots');
beat('EN·MAN', 'BUILD', 2, 'Now a sentence with three slots: a greeting, then the person, then a courtesy. Greeting, person, courtesy.', '1.0');

// 07 BUILD_LADDER (pair T) — 6 steps, ≥2 TRY-FIRST, final swaps 2 slots at L4
const build = [
  { s: 'step 1', level: 1, sentence: 'Bonjour.', tryFirst: false, mark: 'greeting' },
  { s: 'step 2', level: 1, sentence: 'Bonjour, madame.', tryFirst: false, mark: 'person' },
  { s: 'step 3', level: 2, sentence: 'Bonjour, monsieur.', tryFirst: true, mark: 'person' },
  { s: 'step 4', level: 1, sentence: 'Bonjour, madame. Merci !', tryFirst: false, mark: 'courtesy' },
  { s: 'step 5', level: 2, sentence: 'Bonsoir, madame. Merci !', tryFirst: true, mark: 'greeting' },
  { s: 'step 6', level: 4, sentence: 'Au revoir, monsieur. Merci !', tryFirst: true, mark: 'greeting + person' },
];
seg('07', 'BUILD_LADDER');
for (const b of build) {
  step(b.s);
  img(`CHUNK BAR — English slot labels · HIGHLIGHT the changed chunk (${b.mark})`);
  if (!b.tryFirst) beat('FR·WOMAN', 'BUILD', 1, b.sentence, '0.8', { rate: 'slow' }); // HEAR L1 — short listen, production pause is at TRY
  // TRY: produce cue must be L2+ (C-05); final step is L4.
  const tryLevel = Math.max(2, b.level);
  beat('EN·MAN', 'BUILD', tryLevel, b.tryFirst ? 'Your turn — you build it.' : 'Your turn.', P(tryLevel >= 4 ? 'produce_situation' : 'read_aloud', b.sentence));
  beat('FR·WOMAN', 'BUILD', 1, b.sentence, '1.0', { rate: 'natural', extra: ['[confirm]'] }); // CONFIRM L1
}

// 08 INPUT_RETURN — replay the Stage 03 dialogue, identical audio (same lines)
seg('08', 'INPUT_RETURN');
beat('EN·MAN', 'INPUT', 3, 'The same two people once more. Notice how much more you catch now than the first time.', '0.8');
for (const [v, t] of DIALOGUE) beat(v, 'INPUT', 3, t, '0.4', { rate: 'natural' });

// 09 MAKE_IT_YOURS (pair P) — 3 scenarios, L4, speak then write, ≥1 personalized, each with a model
const scen = [
  { s: 'scenario 1', prompt: 'Morning or evening where you are right now? Greet a woman with the right word, and thank her.', model: 'Bonjour, madame. Merci !', personal: true, img: 'a scene at your own front door · WORD BANK: hello / good evening / ma’am / thank you' },
  { s: 'scenario 2', prompt: 'You’re leaving a shop. Say goodbye to the man behind the counter, and that you’ll see him soon.', model: 'Au revoir, monsieur. À bientôt !', personal: false, img: 'leaving a small shop · WORD BANK: goodbye / sir / see you soon' },
  { s: 'scenario 3', prompt: 'It’s evening. Greet a woman, then politely ask — with please.', model: 'Bonsoir, madame. S’il vous plaît.', personal: false, img: 'an evening street · WORD BANK: good evening / ma’am / please' },
];
seg('09', 'MAKE_IT_YOURS');
for (const sc of scen) {
  step(sc.s);
  img(`SCENE — ${sc.img} · MIC`);
  // Speak first, then write — one production pause ([written], exempt from C-03),
  // resolved by a single FR model. Withholding the model until after writing.
  beat('EN·WOMAN', 'MAKE_IT_YOURS', 4, sc.prompt + ' Say it out loud, then write it down.', '12.0', { extra: ['[written]'] });
  beat('EN·WOMAN', 'MAKE_IT_YOURS', 4, 'Here is one way to say it. If yours differs but the pieces fit, it’s right.', '0.8');
  beat('FR·MAN', 'MAKE_IT_YOURS', 4, sc.model, '1.0', { rate: 'natural', extra: ['[confirm]'] });
}

// 10 TRANSFER_TASK (pair P) — L5, unrehearsed situation, blank screen, timed
seg('10', 'TRANSFER_TASK');
img('BLANK — no words, no word bank · MIC · timer');
beat('EN·WOMAN', 'MAKE_IT_YOURS', 5, 'A fresh situation, nothing on the screen. At night, a stranger holds a door for you. Thank the gentleman, wish him a pleasant night, and part warmly.', P('produce_cold', 'Merci, monsieur. Bonsoir, au revoir !'));
beat('FR·MAN', 'MAKE_IT_YOURS', 5, 'Merci, monsieur. Bonsoir, au revoir !', '1.0', { rate: 'natural', extra: ['[confirm]'] });

// 11 FLUENCY_ROUND (pair P) — same sentences, 3 passes, multipliers 3.0/2.0/1.4, no new items
const fluency = ['Bonjour, madame. Merci !', 'Bonsoir, monsieur. Au revoir !', 'Pardon ! À bientôt.'];
seg('11', 'FLUENCY_ROUND');
for (const pass of [1, 2, 3]) {
  beat('EN·WOMAN', 'RECALL', 3, `Pass ${pass}. Same sentences, ${pass === 1 ? 'take your time' : pass === 2 ? 'a little quicker' : 'as fast as you can'}.`, '0.6');
  for (const s of fluency) beat('FR·MAN', 'RECALL', 3, s, P('fluency', s, { pass }), { rate: pass === 1 ? 'slow' : 'natural', extra: [`[fluency: ${pass}]`] });
}

// 12 CAN_DO_CHECK (pair P) — restate can-do as yes/no, scorecard asserts capability, app window
seg('12', 'CAN_DO_CHECK');
img('SCORECARD — capability, not word count · progress');
beat('EN·WOMAN', 'RECAP', 3, 'The question from the start: can you greet someone and take your leave, choosing the right formality and time of day? Yes or no.', '1.0');
beat('EN·WOMAN', 'RECAP', 3, 'You can now greet and take your leave, morning or evening, formally or casually. That’s the whole can-do.', '0.8');
beat('EN·WOMAN', 'RECAP', 3, 'These twelve come back in your app in two days — say them, don’t just read them.', '0.8');

// write
await mkdir(path.join(ROOT, 'lessons/golden'), { recursive: true });
await writeFile(path.join(ROOT, 'lessons/golden/lesson_01.md'), out.join('\n') + '\n', 'utf8');
console.log(`✓ lessons/golden/lesson_01.md  (${out.length} lines)`);
