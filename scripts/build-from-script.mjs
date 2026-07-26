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

import { readFile, writeFile, copyFile } from 'node:fs/promises';
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
// Project voice IDs are baked in as defaults so the pipeline works on any device
// with just an API key; override via .env if you ever change voices.
const VOICES = {
  en_man: process.env.ELEVENLABS_VOICE_EN_MAN || '3TStB8f3X3To0Uj5R7RK',
  en_woman: process.env.ELEVENLABS_VOICE_EN_WOMAN || 'ZqvIIuD5aI9JFejebHiH',
  fr_man: process.env.ELEVENLABS_VOICE_FR_WOMAN || '5OnMHwgTFgvPVwE8jP6B', // single French voice (woman)
  fr_woman: process.env.ELEVENLABS_VOICE_FR_WOMAN || '5OnMHwgTFgvPVwE8jP6B',
};

const GAP = 1.5; // silent breathing room inserted between two back-to-back clips
const MIN_PAUSE = 2; // scripted pauses are floored to this many seconds
const SLIDE_GAP = 0.6; // silent hold appended to each slide so slides don't butt together

const script = JSON.parse(await readFile(path.join(ROOT, 'src/data/scripts', `${LID}.json`), 'utf8'));
const base = JSON.parse(await readFile(path.join(ROOT, 'src/data/lessons', `${LID}.${LANG}.json`), 'utf8'));
const byId = Object.fromEntries(base.slides.map((s) => [s.id, s]));
// Previous take of each clip (by audio path) → its text, so an incremental build
// can reuse clips whose wording is unchanged and only re-call ElevenLabs on edits.
const prevText = new Map();
for (const s of base.slides) for (const b of s.beats || []) if (b.src) prevText.set(b.src, b.text);
// Also index by voice+text so an identical clip already generated under a
// DIFFERENT slide id (e.g. when BUILD segments move to new slides) can be
// copied to the new path instead of re-calling ElevenLabs.
const prevByText = new Map();
for (const s of base.slides) for (const b of s.beats || []) if (b.src && b.text) prevByText.set(`${b.voice}\t${b.text}`, b.src);
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
  // BUILD / SUBJECT render as DYNAMIC practice slides so the on-screen French
  // always tracks the sentence being spoken (the old static sentence-builder
  // showed "Bonjour…" while the audio moved on to "Au revoir…"). One slide per
  // segment keeps timeline order exact.
  // Labels are ENGLISH — only the actual French being taught appears in French.
  else if (/·\s*BUILD/i.test(t)) entries.push({ slide: { id: `build-${entries.length}`, type: 'practice', durationInSeconds: 0, eyebrow: 'Build the sentence', kind: 'build' }, beats: seg.beats });
  else if (/·\s*SUBJECT/i.test(t)) entries.push({ slide: { id: `build-${entries.length}`, type: 'practice', durationInSeconds: 0, eyebrow: 'A new one', kind: 'build' }, beats: seg.beats });
  // YOUR TURN / MODEL are also DYNAMIC — the old static slides were reused for
  // every prompt/example, so they showed one fixed sentence while the audio
  // played different ones. As practice slides they track the spoken line.
  else if (/YOUR TURN/i.test(t)) entries.push({ slide: { id: `yourturn-${entries.length}`, type: 'practice', durationInSeconds: 0, eyebrow: 'Your turn', kind: 'yourturn' }, beats: seg.beats });
  else if (/·\s*MODEL/i.test(t)) entries.push({ slide: { id: `model-${entries.length}`, type: 'practice', durationInSeconds: 0, eyebrow: 'Example answer', kind: 'build' }, beats: seg.beats });
  else if (/·\s*RECAP/i.test(t)) push(byId['recap']);
  else if (/SUMMARY/i.test(t)) push(byId['score']);
  else {
    // Everything else the author wrote (RECALL / MIX IT UP / SPEED ROUND /
    // CAPSTONE / LISTENING CHALLENGE / CULTURE|WRITING NOTE / SCORECARD) is a
    // real part of the lesson — render it as a practice/drill slide instead of
    // dropping it. Kind + label are inferred from the segment title.
    const kind = /NOTE|SCORECARD/i.test(t) ? 'note'
      : /MIX/i.test(t) ? 'mix'
      : /SPEED/i.test(t) ? 'speed'
      : /CAPSTONE/i.test(t) ? 'capstone'
      : 'recall'; // RECALL, LISTENING CHALLENGE, and any other drill
    const eyebrow = /CULTURE NOTE/i.test(t) ? 'Good to know'
      : /WRITING NOTE/i.test(t) ? 'Writing tip'
      : /SCORECARD/i.test(t) ? 'Recap'
      : kind === 'mix' ? 'Put it together'
      : kind === 'speed' ? 'Quick review'
      : kind === 'capstone' ? 'Put it together'
      : 'Review';
    const slide = { id: `practice-${entries.length}`, type: 'practice', durationInSeconds: 0, eyebrow, kind };
    if (kind === 'note') slide.note = seg.beats.filter((b) => b.text && b.voice && b.voice.startsWith('en')).map((b) => b.text).join(' ');
    entries.push({ slide, beats: seg.beats });
  }
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
    if (!/v3/.test(MODEL)) tag = ''; // audio tags ([warm] etc.) only work on eleven v3; v2 would SPEAK them
    const text = tag ? `[${tag}] ${b.text}` : b.text;
    if (noMedia) { outBeats.push({ durationInSeconds: +(wc(b.text) * 0.4 + 0.5).toFixed(2), phase: b.phase, voice: b.voice, text: b.text, line: b.line }); prevSpoken = true; i++; continue; }
    const rel = `assets/audio/${LID}/${LANG}/script/${s.id}_${i}.mp3`;
    const abs = path.join(ROOT, 'public', rel);
    const voiceId = VOICES[b.voice];
    // If this exact clip (same voice+text) exists under another slide id, copy it
    // to the new path — no API call. Handles slides being renamed/regrouped.
    if (!force && !existsSync(abs)) {
      const prior = prevByText.get(`${b.voice}\t${b.text}`);
      if (prior && prior !== rel && existsSync(path.join(ROOT, 'public', prior))) await copyFile(path.join(ROOT, 'public', prior), abs);
    }
    // Reuse the existing clip when nothing changed (or --reuse); regenerate on
    // an edit / new clip / --force. Keeps approved takes across a full build.
    const unchanged = !force && existsSync(abs) && (reuse || prevText.get(rel) === b.text || prevByText.has(`${b.voice}\t${b.text}`));
    const dur = unchanged
      ? (await parseFile(abs)).format.duration || 0
      : await ttsClip({ text, voiceId, model: MODEL, outAbs: abs });
    outBeats.push({ src: rel, durationInSeconds: +dur.toFixed(2), phase: b.phase, voice: b.voice, text: b.text, line: b.line });
    prevSpoken = true;
    i++;
  }
  // Silent hold between slides — a trailing pause beat freezes the last frame
  // briefly so slides don't cut abruptly into each other.
  outBeats.push({ durationInSeconds: SLIDE_GAP });
  s.beats = outBeats;
  delete s.audioSrc;
  s.durationInSeconds = +Math.max(1, outBeats.reduce((a, x) => a + x.durationInSeconds, 0)).toFixed(2);
  slides.push(s);
  console.log(`  · ${s.id.padEnd(12)} ${outBeats.length} beats → ${s.durationInSeconds}s`);
}

const lesson = { ...base, slides };

// Title consistency: if the transcript declares "# Lesson N — Titre (English)",
// make it the title everywhere — editor header, the video's header chrome, and
// the intro title card. Otherwise keep the workbook's title.
const meta = script.meta;
if (meta && meta.titleFr) {
  const num = meta.num ?? Number((base.chrome?.lessonA || '').match(/\d+/)?.[0]) ?? 1;
  lesson.title = `Leçon ${num} — ${meta.titleFr}`;
  lesson.chrome = { ...lesson.chrome, lessonA: `Leçon ${num}`, lessonB: meta.titleFr };
  const title = lesson.slides.find((s) => s.type === 'title');
  if (title) { title.kicker = `Leçon ${num}`; title.titleLines = [meta.titleFr]; if (meta.titleEn) title.subtitle = meta.titleEn; }
}
const outName = limit ? `${LID}.${LANG}.test.json` : `${LID}.${LANG}.json`;
await writeFile(path.join(ROOT, 'src/data/lessons', outName), JSON.stringify(lesson, null, 2) + '\n');
const total = slides.reduce((a, s) => a + s.durationInSeconds, 0);
console.log(`\n✓ ${slides.length} slides → src/data/lessons/${outName}  (≈ ${Math.floor(total / 60)}m ${Math.round(total % 60)}s)\n`);
