// Two-voice script → baked lesson. Takes the parsed production script (beats:
// EN narrator / FR model / PAUSE) and overlays it onto the already-built,
// image-locked lesson slides — generating one ElevenLabs clip per line (v3 with
// audio tags) and inserting the scripted pauses as silent timeline gaps.
//
// Usage:  npm run lesson:script -- --limit 3     # short test (first 3 segments)
//         npm run lesson:script                  # full lesson
//         npm run lesson:script -- --no-media    # structure only (no API)
//
// Reads   src/data/scripts/lesson-01.json         (from parse-script.mjs)
//         src/data/lessons/lesson-01.fr.json      (visuals + locked images)
// Writes  src/data/lessons/lesson-01.fr[.test].json  (baked: beats + durations)
//         public/assets/audio/lesson-01/fr/script/*.mp3

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import { ttsClip, hasElevenKey } from './lib/eleven.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LID = 'lesson-01';
const LANG = 'fr';
const args = process.argv.slice(2);
const noMedia = args.includes('--no-media');
const reuse = args.includes('--reuse'); // reuse ALL existing mp3s, just re-measure + re-bake (no API)
const force = args.includes('--force'); // regenerate EVERY clip, even unchanged ones
const limit = Number((args.find((a) => a.startsWith('--limit')) || '').split(/[=\s]/)[1] || (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : 0)) || 0;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';

// The script labels each line's voice explicitly (en_man / en_woman / fr_man /
// fr_woman). Map straight to the four ElevenLabs IDs — no guessing.
// One French voice only (woman) — fr_man is mapped to her too. Both English
// narrators are kept.
const VOICES = {
  en_man: process.env.ELEVENLABS_VOICE_EN_MAN,
  en_woman: process.env.ELEVENLABS_VOICE_EN_WOMAN,
  fr_man: process.env.ELEVENLABS_VOICE_FR_WOMAN,
  fr_woman: process.env.ELEVENLABS_VOICE_FR_WOMAN,
};

const GAP = 1.5; // silent breathing room inserted between two back-to-back clips
const MIN_PAUSE = 2; // scripted pauses are floored to this many seconds

const script = JSON.parse(await readFile(path.join(ROOT, 'src/data/scripts', `${LID}.json`), 'utf8'));
const base = JSON.parse(await readFile(path.join(ROOT, 'src/data/lessons', `${LID}.${LANG}.json`), 'utf8'));
const byId = Object.fromEntries(base.slides.map((s) => [s.id, s]));
// Previous take of each clip (by audio path) → its text, so an incremental build
// can reuse clips whose wording is unchanged and only re-call ElevenLabs on edits.
const prevText = new Map();
for (const s of base.slides) for (const b of s.beats || []) if (b.src) prevText.set(b.src, b.text);
const vocabByWord = Object.fromEntries(base.slides.filter((s) => s.type === 'vocab').map((s) => [s.word, s]));

const openingSlide = () => ({ id: 'opening', type: 'title', durationInSeconds: 0, kicker: 'Say It · Français', titleLines: ['Bienvenue !'], subtitle: 'Learn to speak, not just read', methodLabels: ['Meet', 'Echo', 'Build', 'Make It Yours'], imageSrc: byId['title']?.imageSrc });
const recallMidSlide = (items) => ({ id: 'recall-mid', type: 'recap', durationInSeconds: 0, eyebrow: 'Rappel express', items });

// ---- map script segments → slide entries (visuals + beats), in script order --
const segs = limit ? script.segments.slice(0, limit) : script.segments;
const entries = [];
const collected = [];
for (const seg of segs) {
  const t = seg.title;
  const push = (slide) => entries.push({ slide, beats: seg.beats });
  if (/Opening/i.test(t)) push(openingSlide());
  else if (/·\s*GOAL/i.test(t)) push(byId['title']);
  else if (/WORD\s*[—-]/i.test(t)) {
    const word = t.split(/[—-]/).pop().trim();
    const vs = vocabByWord[word];
    if (!vs) { console.warn(`  ! no vocab slide for "${word}" — skipping`); continue; }
    collected.push({ word: vs.word, translation: vs.translation });
    push(vs);
  } else if (/QUICK RECALL/i.test(t)) push(recallMidSlide(collected.slice()));
  else if (/·\s*BUILD/i.test(t)) {
    let e = entries.find((x) => x.slide.id === 'buildup-7');
    if (!e) { e = { slide: byId['buildup-7'], beats: [] }; entries.push(e); }
    e.beats = e.beats.concat(seg.beats);
  } else if (/·\s*SUBJECT/i.test(t)) push(byId['subject-8']);
  else if (/YOUR TURN/i.test(t)) push(byId['yourturn-9']);
  else if (/·\s*MODEL/i.test(t)) push(byId['model-10']);
  else if (/·\s*RECAP/i.test(t)) push(byId['recap']);
  else if (/SUMMARY/i.test(t)) push(byId['score']);
}

// ---- generate audio per beat, build slide.beats + duration ------------------
if (!noMedia && !hasElevenKey()) { console.error('\n✗ ELEVENLABS_API_KEY not set — add voices to .env first.\n'); process.exit(1); }
if (!noMedia) {
  const missing = Object.entries(VOICES).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) { console.error(`\n✗ Missing voice IDs in .env: ${missing.join(', ')}\n`); process.exit(1); }
}
const wc = (s) => s.split(/\s+/).filter(Boolean).length;
console.log(`\n▶ ${limit ? `TEST (${limit} segments)` : 'full lesson'} · model ${MODEL}`);
console.log(`  voices → EN man ${VOICES.en_man} / woman ${VOICES.en_woman} · FR man ${VOICES.fr_man} / woman ${VOICES.fr_woman}`);

const slides = [];
for (const e of entries) {
  const s = structuredClone(e.slide);
  const outBeats = [];
  let i = 0;
  let prevSpoken = false;
  for (const b of e.beats) {
    // Scripted pause = learner speaks; floored to MIN_PAUSE + a small settle.
    if (b.pause != null) {
      outBeats.push({ durationInSeconds: +(Math.max(b.pause, MIN_PAUSE) + 0.3).toFixed(2), phase: b.phase });
      prevSpoken = false;
      continue;
    }
    // Breathing room between two back-to-back clips (no scripted pause between).
    if (prevSpoken) outBeats.push({ durationInSeconds: GAP, phase: b.phase });
    // French voice is ALWAYS natural — strip delivery tags except a slow pass.
    let tag = b.tag;
    if (b.voice.startsWith('fr')) tag = /slow/i.test(tag || '') ? 'slowly' : '';
    const text = tag ? `[${tag}] ${b.text}` : b.text;
    if (noMedia) { outBeats.push({ durationInSeconds: +(wc(b.text) * 0.4 + 0.5).toFixed(2), phase: b.phase, voice: b.voice, text: b.text, line: b.line }); prevSpoken = true; i++; continue; }
    const rel = `assets/audio/${LID}/${LANG}/script/${s.id}_${i}.mp3`;
    const abs = path.join(ROOT, 'public', rel);
    const voiceId = VOICES[b.voice];
    // Reuse the existing clip when nothing changed (or --reuse); regenerate on
    // an edit / new clip / --force. Keeps approved takes across a full build.
    const unchanged = !force && existsSync(abs) && (reuse || prevText.get(rel) === b.text);
    const dur = unchanged
      ? (await parseFile(abs)).format.duration || 0
      : await ttsClip({ text, voiceId, model: MODEL, outAbs: abs });
    outBeats.push({ src: rel, durationInSeconds: +dur.toFixed(2), phase: b.phase, voice: b.voice, text: b.text, line: b.line });
    prevSpoken = true;
    i++;
  }
  s.beats = outBeats;
  delete s.audioSrc;
  s.durationInSeconds = +Math.max(1, outBeats.reduce((a, x) => a + x.durationInSeconds, 0)).toFixed(2);
  slides.push(s);
  console.log(`  · ${s.id.padEnd(12)} ${outBeats.length} beats → ${s.durationInSeconds}s`);
}

const lesson = { ...base, slides };
const outName = limit ? `${LID}.${LANG}.test.json` : `${LID}.${LANG}.json`;
await writeFile(path.join(ROOT, 'src/data/lessons', outName), JSON.stringify(lesson, null, 2) + '\n');
const total = slides.reduce((a, s) => a + s.durationInSeconds, 0);
console.log(`\n✓ ${slides.length} slides → src/data/lessons/${outName}  (≈ ${Math.floor(total / 60)}m ${Math.round(total % 60)}s)\n`);
