#!/usr/bin/env node
// Emit build/<video-id>/manifest.json — the single source the QA gates read.
//
//   node scripts/qa/manifest.mjs <video-id>       # e.g. lesson-01
//
// One row per beat (spoken line or pause), with: source script line, speaker,
// intended French, the ON-SCREEN text the slide actually shows during that beat
// (mirrors the render components, so Gate B can detect caption↔audio drift),
// video-relative timings (incl. the 4.5s intro offset so times match the mp4),
// and assets. Pure read of the baked lesson + parsed script — no generation.

import { existsSync } from 'node:fs';
import { paths, readJson, writeJson, FPS, INTRO_SECONDS, OUTRO_SECONDS, ROOT } from './lib.mjs';
import path from 'node:path';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.bakedLesson)) { console.error(`✗ no baked lesson: ${path.relative(ROOT, P.bakedLesson)}`); process.exit(1); }

const lesson = await readJson(P.bakedLesson);
const script = existsSync(P.script) ? await readJson(P.script) : { segments: [] };

// line (in .sent.md) → segment title, so each beat knows its segment.
const lineToSegment = {};
for (const seg of script.segments) for (const b of seg.beats || []) if (b.line != null) lineToSegment[b.line] = seg.title;

// What prominent text is ON SCREEN during a beat — mirrors the slide components:
//  practice(non-note): the most-recently-spoken line (held through pauses)
//  practice note:      the note paragraph
//  vocab:              the headword
//  title/score/recap:  static content (not a single caption → not caption-checked)
function onScreenFor(slide, beats, i, lastSpokenText) {
  if (slide.type === 'vocab') return { text: slide.word || '', checkable: true };
  if (slide.type === 'practice') {
    if (slide.kind === 'note') return { text: slide.note || slide.heading || '', checkable: false };
    return { text: lastSpokenText || '', checkable: true };
  }
  if (slide.type === 'title') return { text: (slide.titleLines || []).join(' ') || slide.kicker || '', checkable: false };
  if (slide.type === 'score') return { text: slide.nowSaySentence || slide.headline || '', checkable: false };
  if (slide.type === 'recap') return { text: slide.eyebrow || '', checkable: false };
  return { text: '', checkable: false };
}

const rows = [];
let cursor = INTRO_SECONDS; // video time starts after the intro
let beatIndex = 0;
for (const slide of lesson.slides) {
  const beats = slide.beats || [];
  let lastSpokenText = '';
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const start = cursor;
    const dur = b.durationInSeconds || 0;
    cursor += dur;
    const isPause = !b.src;
    if (!isPause) lastSpokenText = b.text || lastSpokenText;
    const os = onScreenFor(slide, beats, i, lastSpokenText);
    const isFr = !!b.voice && b.voice.startsWith('fr');
    const isEn = !!b.voice && b.voice.startsWith('en');
    rows.push({
      index: beatIndex++,
      segment: b.line != null ? lineToSegment[b.line] || null : null,
      slideId: slide.id,
      slideType: slide.type,
      practiceKind: slide.type === 'practice' ? slide.kind : null,
      onScreenLabel: slide.eyebrow || slide.kicker || null,
      phase: b.phase || null,
      // Say It Method declared fields (Gate B reads these; populated by the
      // new-grammar generator — null on old-grammar lessons).
      stage: slide.stage || b.stage || null,
      supportLevel: Number.isInteger(b.level) ? b.level : (b.level ?? null),
      rateTag: b.rate || null,
      visual: (b.visuals && b.visuals.length ? b.visuals.join(' ; ') : slide.visual) || null,
      speaker: isPause ? 'pause' : b.voice || 'narrator',
      kind: isPause ? 'pause' : isFr ? 'french' : isEn ? 'english' : 'other',
      spokenText: isPause ? null : b.text || '',
      intendedFrench: isFr ? b.text || '' : null,
      onScreenText: os.text,
      captionCheckable: os.checkable && !isPause,
      videoStart: +start.toFixed(3),
      videoEnd: +cursor.toFixed(3),
      durationSeconds: +dur.toFixed(3),
      // pause_mid — the frame to sample for a retrieval pause (I-05).
      pauseMid: isPause ? +((start + cursor) / 2).toFixed(3) : null,
      sourceLine: b.line ?? null,
      audioAsset: b.src || null,
      imageAsset: slide.imageSrc || null,
    });
  }
}

const lessonSeconds = cursor - INTRO_SECONDS;
const manifest = {
  videoId: id,
  videoPath: path.relative(ROOT, P.video),
  videoPresent: existsSync(P.video),
  fps: FPS,
  introSeconds: +INTRO_SECONDS.toFixed(3),
  outroSeconds: +OUTRO_SECONDS.toFixed(3),
  lessonSeconds: +lessonSeconds.toFixed(3),
  filmSeconds: +(cursor + OUTRO_SECONDS).toFixed(3),
  title: lesson.title,
  language: lesson.language,
  slideCount: lesson.slides.length,
  beatCount: rows.length,
  frenchLineCount: rows.filter((r) => r.kind === 'french').length,
  lines: rows,
};

await writeJson(P.manifest, manifest);
console.log(`✓ manifest → build/${id}/manifest.json  (${rows.length} beats, ${manifest.frenchLineCount} French lines, film ${Math.floor(manifest.filmSeconds / 60)}m${Math.round(manifest.filmSeconds % 60)}s)`);
