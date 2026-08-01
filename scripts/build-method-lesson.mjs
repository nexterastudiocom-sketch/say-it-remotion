#!/usr/bin/env node
// Baker (Command 3) — Method-grammar lesson .md → baked Remotion lesson JSON.
// Parses via the reference engine (mosaic_qc.py --emit-beats), groups beats into
// slides by segment, carries the Method fields (stage/level/rate/visual) onto
// every beat, and materializes scripted pauses as silent timeline gaps.
//
//   node scripts/build-method-lesson.mjs <id> [--no-media]
//     --no-media : estimated durations, no ElevenLabs (free, structural)
//
// Reads  lessons/<id>.md (or lessons/golden/<id_>.md)
// Writes src/data/lessons/<id>.method.json   (consumed by scripts/qa/manifest.mjs)

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ttsClip, hasElevenKey } from './lib/eleven.mjs';
import { parseFile } from 'music-metadata';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA_PY = process.env.QA_PY || path.join(ROOT, '.venv-ocr/bin/python');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) || 'lesson-01';
const noMedia = args.includes('--no-media');

// FR rate → fraction of REAL (conversational) speed. French is generated at
// ElevenLabs speed 1.0 (real normal) then time-stretched by atempo, because
// learners need it slow: "normal" plays at 0.75× real, the slower tags near 0.5×.
// (ElevenLabs' own speed param floors at 0.7, so the slowdown is done in ffmpeg.)
// FR woman ran too slow — nudged up: normal 0.75→0.85 (+0.1), the slower tags +0.2.
const RATE_ATEMPO = { very_slow: 0.7, slow: 0.75, natural: 0.85, fast: 0.95 };
const VOICES = {
  'EN·MAN': process.env.ELEVENLABS_VOICE_EN_MAN || 'uh5qBlKfjqFl7XXhFnJi',
  'EN·WOMAN': process.env.ELEVENLABS_VOICE_EN_WOMAN || 'Bn9xWp6PwkrqKRbq8cX2',
  'FR·WOMAN': process.env.ELEVENLABS_VOICE_FR_WOMAN || 'Y54PWsHC8udAjARe8URQ',
  'FR·MAN': process.env.ELEVENLABS_VOICE_FR_MAN || 'kKgyAHjGAbeWHCNd7qoC',
};
const voiceKey = (v) => v.toLowerCase().replace('·', '_'); // FR·WOMAN → fr_woman
// French vocab must be spoken CLEANLY. The expressive v3 model intermittently
// appends hums/filler after a word ("mmm", or whole tags like "C'est ça ?"), which
// is wrong for single-word teaching. multilingual_v2 reads the text literally.
// English narration keeps v3. Model is part of the clip cache key (below), so
// switching it re-synthesizes only the affected voice.
const MODEL_EN = process.env.ELEVENLABS_MODEL || 'eleven_v3';
const MODEL_FR = process.env.ELEVENLABS_MODEL_FR || 'eleven_multilingual_v2';

// stage → a Remotion slide type (render components map from this; unbuilt stages
// fall back to a generic 'method' slide that still carries all the data).
const STAGE_TYPE = {
  CAN_DO_GOAL: 'title', WARM_UP: 'practice', COLD_INPUT: 'dialogue', ITEM_BLOCK: 'vocab',
  MICRO_RECALL: 'practice', FRAME_INTRO: 'buildbar', BUILD_LADDER: 'buildbar',
  INPUT_RETURN: 'dialogue', MAKE_IT_YOURS: 'scenario', TRANSFER_TASK: 'transfer',
  FLUENCY_ROUND: 'practice', CAN_DO_CHECK: 'score',
};

// ---- parse via the engine's --emit-beats ------------------------------------
const tPaths = [`lessons/${id}.md`, `curriculum/${id}.md`, `lessons/golden/${id.replace('-', '_')}.md`];
const transcript = tPaths.map((p) => path.join(ROOT, p)).find(existsSync);
if (!transcript) { console.error(`✗ no Method-grammar transcript for ${id}`); process.exit(2); }
if (!noMedia && !hasElevenKey()) { console.error('✗ ELEVENLABS_API_KEY not set (or use --no-media)'); process.exit(1); }

const { execFileSync } = await import('node:child_process');
const beatsPath = path.join(ROOT, `build/${id}/parsed-beats.json`);
await mkdir(path.dirname(beatsPath), { recursive: true });
execFileSync(QA_PY, [path.join(ROOT, 'qa/mosaic_qc.py'), transcript, '--rules', path.join(ROOT, 'qa/mosaic_rules.yaml'), '--emit-beats', beatsPath], { cwd: ROOT });
const parsed = JSON.parse(await (await import('node:fs/promises')).readFile(beatsPath, 'utf8'));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const wc = (s) => s.split(/\s+/).filter(Boolean).length;

// Two-register model (Method §4.2): every voiced beat is a WORD (the language —
// French word or its English meaning) or an INSTRUCTION (what to do). French is
// always a word; an English gloss with no procedural marker is a meaning, anything
// procedural is an instruction. Baked onto the beat so the renderer + gates read
// the role from data instead of re-deriving it.
const INSTR_RE = /\b(listen|repeat|say|turn|now you|again|do ?n['’]?t|point|answer|ask|out loud|in french|in english|ready|one more|this time|your|nasal|nose|throat|tongue|silent|sound|air|stress|syllable|hear|heard)\b/i;
const registerOf = (voice, text) => {
  if (voice.startsWith('FR')) return 'word';
  const s = (text || '').trim();
  if (!s) return 'instruction';
  if (INSTR_RE.test(s)) return 'instruction';
  return s.split(/\s+/).filter(Boolean).length <= 6 ? 'meaning' : 'instruction';
};

// ---- group beats by segment → slides ----------------------------------------
// Content-addressed clip cache: an identical (voice·rate·text) utterance is
// synthesized once and reused. This is what makes INPUT_RETURN replay the SAME
// recording as COLD_INPUT (S-08 byte-identity) instead of a fresh take — and it
// cuts the ElevenLabs call count for every repeated line.
const clipCache = new Map(); // key → { rel, dur }
let clipN = 0;

// Bake-or-read one spoken beat's clip, content-addressed + cached → { rel, dur }.
// Same (voice·model·rate·atempo·text) utterance is synthesized once and reused, so
// look-ahead measuring an answer clip here costs nothing when the loop reaches it.
async function clipFor(b) {
  const isFr = b.voice.startsWith('FR');
  if (noMedia) {
    const dur = isFr ? Math.max(0.4, b.est_audio_s) : +(wc(b.text) * 0.38 + 0.4).toFixed(2);
    return { rel: null, dur: +dur.toFixed(2) };
  }
  const model = isFr ? MODEL_FR : MODEL_EN;
  // French is slowed NATIVELY by ElevenLabs speech speed (the model articulates
  // slowly, cleanly) instead of ffmpeg atempo time-stretch — the stretch smeared
  // liaisons and made "au revoir" sound separated. Same rate→factor numbers, now
  // applied as speech speed with NO stretch. FR key changes (nspeed…) so French
  // re-synthesizes; EN key (atempo1) is unchanged so English audio is preserved.
  const frSpeed = isFr ? (RATE_ATEMPO[b.rate] ?? 0.75) : 1;
  const key = isFr
    ? `${b.voice}|${model}|${b.rate || 'natural'}|nspeed${frSpeed}|${b.text}`
    : `${b.voice}|${b.rate || 'natural'}|atempo1|${b.text}`;
  let hit = clipCache.get(key);
  if (!hit) {
    const h = createHash('sha1').update(key).digest('hex').slice(0, 16);
    const rel = `assets/audio/${id}/method/${h}.mp3`;
    const abs = path.join(ROOT, 'public', rel);
    let d;
    if (existsSync(abs)) d = (await parseFile(abs)).format.duration || 1;
    else {
      // Retry transient TTS failures — a dropped call must NOT leave a dangling
      // clip reference (missing file → silent gap in the render + S-08 MISSING).
      clipN++;
      for (let att = 1; att <= 3; att++) {
        try { d = await ttsClip({ text: b.text, voiceId: VOICES[b.voice], model, outAbs: abs, speed: frSpeed, atempo: 1 }); }
        catch (e) { if (att === 3) console.error(`  ✗ TTS failed x3: "${b.text.slice(0, 40)}" — ${String(e.message).split('\n')[0]}`); }
        if (existsSync(abs)) { d = (await parseFile(abs)).format.duration || d || 1; break; }
      }
      if (d == null) d = 1;
    }
    hit = { rel, dur: +Number(d).toFixed(2) };
    clipCache.set(key, hit);
  }
  return hit;
}

// ---- HYBRID production pause (method v2) -------------------------------------
// The learner pause on a produced phrase is derived from the MEASURED duration of
// the model clip that immediately follows (the confirm), never a syllable estimate:
//   pause = clamp(floor, model_dur * say_back_mult + think, ceiling)
// A production slot is a PRODUCE/RECALL/BUILD beat whose pause is followed by the FR
// phrase the learner must say. "Say the English" / "produce your own" slots have no
// single model clip, so they keep the authored estAudio pause.
const { timing } = await import('./qa/pbeat.mjs');
const HYB = (await timing()).hybrid_pause || {};
const PRODUCE_PHASES = new Set(['PRODUCE', 'RECALL', 'BUILD']);
const producedFr = new Set();
// lineMode = producing a whole SENTENCE (build/fluency/checkpoint line), not a single
// word. A learner recalling + producing a multi-word line needs a bigger say-back
// factor AND a bigger think buffer, and a much higher ceiling than a single word.
const hybridBase = (modelDur, isNew, lineMode = false) => {
  const mult = lineMode ? (HYB.line_say_back_mult ?? 1.7) : (HYB.say_back_mult ?? 1.3);
  const think = lineMode ? (HYB.line_think_s ?? 2.0) : (HYB.think_s ?? 1.0);
  let p = modelDur * mult + think;
  if (isNew) p *= (HYB.new_item_bonus ?? 1.15);
  const ceil = lineMode ? (HYB.line_ceiling_s ?? 8.5) : (HYB.ceiling_s ?? 4.5);
  return Math.max(HYB.floor_s ?? 2.0, Math.min(ceil, p));
};

const slides = [];
let cur = null;
for (let i = 0; i < parsed.beats.length; i++) {
  const b = parsed.beats[i];
  if (!cur || cur.segment !== b.segment) {
    cur = { id: slug(b.segment) || `s${slides.length}`, type: STAGE_TYPE[b.stage] || 'method', stage: b.stage, segment: b.segment, visual: null, durationInSeconds: 0, beats: [] };
    slides.push(cur);
  }
  if (b.visuals && b.visuals.length && !cur.visual) cur.visual = b.visuals.join(' ; ');
  const isFr = b.voice.startsWith('FR');
  const clip = await clipFor(b);
  cur.beats.push({ ...(clip.rel ? { src: clip.rel } : {}), durationInSeconds: clip.dur, phase: b.phase, voice: voiceKey(b.voice), text: b.text, register: registerOf(b.voice, b.text), level: b.level, rate: b.rate || null, stage: b.stage, visuals: b.visuals, line: b.line });

  // scripted pause → silent gap beat. Two dynamic cases, both timed from MEASURED
  // audio: (A) EN cue → pause → FR answer = produce; the pause fits the ANSWER clip.
  // (B) FR model → pause = repeat-after-me; the pause fits the clip JUST HEARD (this
  // beat's own clip). Everything else keeps its authored value.
  if (b.pause > 0) {
    const nxt = parsed.beats[i + 1];
    const isProduce = !noMedia && PRODUCE_PHASES.has(b.phase) && b.pause >= 2.0 && !isFr && nxt && nxt.voice.startsWith('FR');
    const isRepeat = !noMedia && isFr && b.pause >= 1.5;
    if (isProduce) {
      const ans = await clipFor(nxt);                      // MEASURED answer duration
      const isNew = !producedFr.has(nxt.text);
      const line = ans.dur > 1.8 || wc(nxt.text) >= 3;     // a whole sentence, not one word
      const base = +hybridBase(ans.dur, isNew, line).toFixed(2);
      producedFr.add(nxt.text);
      cur.beats.push({ durationInSeconds: base, phase: b.phase, level: b.level, stage: b.stage, _prod: true, _base: base });
    } else if (isRepeat) {
      const line = clip.dur > 1.8 || wc(b.text) >= 3;      // repeating a whole line
      const base = +hybridBase(clip.dur, false, line).toFixed(2); // repeat what was just heard
      cur.beats.push({ durationInSeconds: base, phase: b.phase, level: b.level, stage: b.stage, _prod: true, _base: base });
    } else {
      cur.beats.push({ durationInSeconds: +b.pause.toFixed(2), phase: b.phase, level: b.level, stage: b.stage });
    }
  }
}
// Leading pause — a beat of silence before the first word (after the intro logo),
// so the goal card lands and settles before the narration starts.
const first = slides[0];
if (first?.beats?.length) first.beats.unshift({ durationInSeconds: 1.2, phase: first.beats[0].phase, level: first.beats[0].level, stage: first.stage });

// Opening ramp — production pauses in the first opening_ramp_fraction of the film
// run longer (the learner is coldest at the start), decaying linearly to 1.0×.
{
  const flat = [];
  for (const s of slides) for (const bt of s.beats) flat.push(bt);
  const total = flat.reduce((a, x) => a + x.durationInSeconds, 0);
  const rampFrac = HYB.opening_ramp_fraction ?? 0.17, om = HYB.opening_multiplier ?? 1.35;
  let cum = 0;
  for (const bt of flat) {
    if (bt._prod && total) {
      const pos = cum / total;
      if (pos < rampFrac) {
        const factor = 1 + (om - 1) * (1 - pos / rampFrac);
        bt.durationInSeconds = +Math.max(HYB.floor_s ?? 2.0, Math.min(HYB.ceiling_s ?? 4.5, bt._base * factor)).toFixed(2);
      }
    }
    cum += bt.durationInSeconds;
  }
  for (const bt of flat) { delete bt._prod; delete bt._base; }
}
for (const s of slides) s.durationInSeconds = +s.beats.reduce((a, x) => a + x.durationInSeconds, 0).toFixed(2);

// ---- image registry binding (Command 6) ------------------------------------
// Resolve each slide/beat to its registry image (shared with scripts/images/bind.mjs
// so a fresh bake and a post-hoc rebind stay identical). MOSAIC_IMAGES_STRICT=1
// requires approved-only (final render); otherwise 'generated' also renders.
{
  const { bindImages } = await import('./images/bind-lib.mjs');
  await bindImages(slides, parsed.meta.lesson, ROOT, { strict: process.env.MOSAIC_IMAGES_STRICT === '1' });
}

const lesson = {
  title: `Leçon ${parsed.meta.lesson} — ${(parsed.meta.can_do || '').replace(/^I can /, '').replace(/\.$/, '')}`,
  language: parsed.meta.language || 'fr',
  method: true,
  meta: parsed.meta,
  // Header subtitle (lessonB) is an ENGLISH/neutral topic from meta.title — it must
  // NEVER contain a taught French word (X-06/I-05: the persistent header is on screen
  // during retrieval; "Dire bonjour" leaked the answer). Empty → header shows just "Leçon N".
  chrome: { lessonA: `Leçon ${parsed.meta.lesson}`, lessonB: parsed.meta.title || '', level: parsed.meta.level, progressLabel: 'Progression', wordUnit: 'mots', wordsFrom: 0, wordsTo: (parsed.meta.items || []).length, wordsTotal: 235 },
  ui: { repeat: 'À toi' },
  slides,
};
const outRel = `src/data/lessons/${id}.method.json`;
await writeFile(path.join(ROOT, outRel), JSON.stringify(lesson, null, 2) + '\n');
const total = slides.reduce((a, s) => a + s.durationInSeconds, 0);
console.log(`✓ ${outRel}  (${slides.length} slides, ${parsed.beats.length} beats → ${Math.floor(total / 60)}m${Math.round(total % 60)}s${noMedia ? ', --no-media' : ''})`);
console.log(`  stages: ${[...new Set(slides.map((s) => s.stage))].join(', ')}`);
