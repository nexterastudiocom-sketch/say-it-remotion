#!/usr/bin/env node
// Baker (Command 3) — Method-grammar lesson .md → baked Remotion lesson JSON.
// Parses via the reference engine (say_it_qc.py --emit-beats), groups beats into
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

// FR rate → ElevenLabs speed hint (v3). very_slow/slow render slow so R-06 passes.
const RATE_SPEED = { very_slow: 0.7, slow: 0.85, natural: 1.0, fast: 1.15 };
const VOICES = {
  'EN·MAN': process.env.ELEVENLABS_VOICE_EN_MAN || 'uh5qBlKfjqFl7XXhFnJi',
  'EN·WOMAN': process.env.ELEVENLABS_VOICE_EN_WOMAN || 'Bn9xWp6PwkrqKRbq8cX2',
  'FR·WOMAN': process.env.ELEVENLABS_VOICE_FR_WOMAN || 'Y54PWsHC8udAjARe8URQ',
  'FR·MAN': process.env.ELEVENLABS_VOICE_FR_MAN || 'kKgyAHjGAbeWHCNd7qoC',
};
const voiceKey = (v) => v.toLowerCase().replace('·', '_'); // FR·WOMAN → fr_woman
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';

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
execFileSync(QA_PY, [path.join(ROOT, 'qa/say_it_qc.py'), transcript, '--rules', path.join(ROOT, 'qa/say_it_rules.yaml'), '--emit-beats', beatsPath], { cwd: ROOT });
const parsed = JSON.parse(await (await import('node:fs/promises')).readFile(beatsPath, 'utf8'));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const wc = (s) => s.split(/\s+/).filter(Boolean).length;

// ---- group beats by segment → slides ----------------------------------------
// Content-addressed clip cache: an identical (voice·rate·text) utterance is
// synthesized once and reused. This is what makes INPUT_RETURN replay the SAME
// recording as COLD_INPUT (S-08 byte-identity) instead of a fresh take — and it
// cuts the ElevenLabs call count for every repeated line.
const clipCache = new Map(); // key → { rel, dur }
const slides = [];
let cur = null, clipN = 0;
for (const b of parsed.beats) {
  if (!cur || cur.segment !== b.segment) {
    cur = { id: slug(b.segment) || `s${slides.length}`, type: STAGE_TYPE[b.stage] || 'method', stage: b.stage, segment: b.segment, visual: null, durationInSeconds: 0, beats: [] };
    slides.push(cur);
    clipN = 0;
  }
  if (b.visuals && b.visuals.length && !cur.visual) cur.visual = b.visuals.join(' ; ');
  // spoken beat
  const isFr = b.voice.startsWith('FR');
  let dur;
  if (noMedia) {
    dur = isFr ? Math.max(0.4, b.est_audio_s) : +(wc(b.text) * 0.38 + 0.4).toFixed(2);
    cur.beats.push({ durationInSeconds: +dur.toFixed(2), phase: b.phase, voice: voiceKey(b.voice), text: b.text, level: b.level, rate: b.rate || null, stage: b.stage, visuals: b.visuals, line: b.line });
  } else {
    const speed = isFr ? RATE_SPEED[b.rate] : 1.0;
    const key = `${b.voice}|${b.rate || 'natural'}|${speed}|${b.text}`;
    let hit = clipCache.get(key);
    if (!hit) {
      // Stable, content-addressed name so the same utterance always resolves to
      // the same file regardless of which slide first emitted it.
      const h = createHash('sha1').update(key).digest('hex').slice(0, 16);
      const rel = `assets/audio/${id}/method/${h}.mp3`;
      const abs = path.join(ROOT, 'public', rel);
      const d = await ttsClip({ text: b.text, voiceId: VOICES[b.voice], model: MODEL, outAbs: abs, speed }).catch(async () => (existsSync(abs) ? (await parseFile(abs)).format.duration || 1 : 1));
      hit = { rel, dur: +Number(d).toFixed(2) };
      clipCache.set(key, hit);
      clipN++;
    }
    dur = hit.dur;
    cur.beats.push({ src: hit.rel, durationInSeconds: hit.dur, phase: b.phase, voice: voiceKey(b.voice), text: b.text, level: b.level, rate: b.rate || null, stage: b.stage, visuals: b.visuals, line: b.line });
  }
  // scripted pause → silent gap beat
  if (b.pause > 0) cur.beats.push({ durationInSeconds: +b.pause.toFixed(2), phase: b.phase, level: b.level, stage: b.stage });
}
for (const s of slides) s.durationInSeconds = +s.beats.reduce((a, x) => a + x.durationInSeconds, 0).toFixed(2);

// ---- image registry binding (Command 6) ------------------------------------
// Resolve each slide/beat to its registry image (shared with scripts/images/bind.mjs
// so a fresh bake and a post-hoc rebind stay identical). SAYIT_IMAGES_STRICT=1
// requires approved-only (final render); otherwise 'generated' also renders.
{
  const { bindImages } = await import('./images/bind-lib.mjs');
  await bindImages(slides, parsed.meta.lesson, ROOT, { strict: process.env.SAYIT_IMAGES_STRICT === '1' });
}

const lesson = {
  title: `Leçon ${parsed.meta.lesson} — ${(parsed.meta.can_do || '').replace(/^I can /, '').replace(/\.$/, '')}`,
  language: parsed.meta.language || 'fr',
  method: true,
  meta: parsed.meta,
  chrome: { lessonA: `Leçon ${parsed.meta.lesson}`, lessonB: 'Dire bonjour', level: parsed.meta.level, progressLabel: 'Progression', wordUnit: 'mots', wordsFrom: 0, wordsTo: (parsed.meta.items || []).length, wordsTotal: 235 },
  ui: { repeat: 'À toi' },
  slides,
};
const outRel = `src/data/lessons/${id}.method.json`;
await writeFile(path.join(ROOT, outRel), JSON.stringify(lesson, null, 2) + '\n');
const total = slides.reduce((a, s) => a + s.durationInSeconds, 0);
console.log(`✓ ${outRel}  (${slides.length} slides, ${parsed.beats.length} beats → ${Math.floor(total / 60)}m${Math.round(total % 60)}s${noMedia ? ', --no-media' : ''})`);
console.log(`  stages: ${[...new Set(slides.map((s) => s.stage))].join(', ')}`);
