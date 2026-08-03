// timing.test.mjs — node:test coverage for the frame-exact timeline.
//
//   node --test scripts/youtube/timing.test.mjs
//
// These are the invariants the caption and chapter output depend on. The
// overlap test in particular is load-bearing: an overlapping cue is how French
// text leaks into a retrieval gap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline, deriveChapters, srtTime, vttTime, chapterTime,
  FPS, INTRO_FRAMES, OUTRO_FRAMES,
} from './timing.mjs';

// Two slides. Slide A's beats sum to 2.0s but the slide is only 1.9s, so the
// last beat must be clipped — this is the overrun case from real lessons.
function method() {
  return {
    slides: [
      {
        id: 'a', stage: 'COLD_INPUT', durationInSeconds: 1.9,
        beats: [
          { durationInSeconds: 1.0, text: 'Listen to this.', voice: 'en_woman', phase: 'INPUT' },
          { durationInSeconds: 1.0, text: 'Bonjour.', voice: 'fr_woman', phase: 'INPUT' },
        ],
      },
      {
        id: 'b', stage: 'ITEM_BLOCK', durationInSeconds: 2.0,
        beats: [
          { durationInSeconds: 1.0, text: 'Say it.', voice: 'en_woman' },
          { durationInSeconds: 1.0 }, // silent retrieval gap — no text
        ],
      },
    ],
  };
}

test('beats start after the brand intro', () => {
  const t = buildTimeline(method());
  assert.equal(t.beats[0].startFrame, INTRO_FRAMES);
  assert.equal(t.beats[0].startSec, INTRO_FRAMES / FPS);
});

test('film length = intro + lesson + outro', () => {
  const t = buildTimeline(method());
  // slides sum to 3.9s -> 117 frames
  assert.equal(t.lessonFrames, 117);
  assert.equal(t.filmFrames, INTRO_FRAMES + 117 + OUTRO_FRAMES);
  assert.equal(t.filmSeconds, t.filmFrames / FPS);
});

test('a beat overrunning its slide is clipped, not allowed to overlap', () => {
  const t = buildTimeline(method());
  // Slide A is 1.9s = 57 frames; its two 30-frame beats would need 60.
  const slideA = t.beats.filter((b) => b.slideId === 'a');
  assert.equal(slideA.length, 2);
  assert.equal(slideA[1].endFrame - INTRO_FRAMES, 57, 'second beat clipped to the slide end');
});

test('no two beats ever overlap', () => {
  const t = buildTimeline(method());
  for (let i = 1; i < t.beats.length; i++) {
    assert.ok(
      t.beats[i].startFrame >= t.beats[i - 1].endFrame,
      `beat ${i} starts at ${t.beats[i].startFrame} before beat ${i - 1} ends at ${t.beats[i - 1].endFrame}`
    );
  }
});

test('every beat has positive duration', () => {
  const t = buildTimeline(method());
  for (const b of t.beats) assert.ok(b.endFrame > b.startFrame, `beat ${b.index} is empty`);
});

test('silent beats are marked non-speech so they emit no cue', () => {
  const t = buildTimeline(method());
  const gap = t.beats.find((b) => b.slideId === 'b' && !b.text);
  assert.ok(gap, 'the retrieval gap beat exists');
  assert.equal(gap.isSpeech, false);
  assert.equal(t.beats.filter((b) => b.isSpeech).length, 3);
});

test('buildTimeline rejects a method with no slides', () => {
  assert.throws(() => buildTimeline({}), /slides\[\] is required/);
});

test('chapters start at 0, ascend, and stay >= 10s apart', () => {
  const long = {
    slides: [
      { id: 's1', stage: 'COLD_INPUT', durationInSeconds: 30, beats: [{ durationInSeconds: 30, text: 'a' }] },
      // starts only 5s later -> must be merged away, not emitted
      { id: 's2', stage: 'MICRO_RECALL', durationInSeconds: 5, beats: [{ durationInSeconds: 5, text: 'b' }] },
      { id: 's3', stage: 'ITEM_BLOCK', durationInSeconds: 40, beats: [{ durationInSeconds: 40, text: 'c' }] },
      { id: 's4', stage: 'CAN_DO_CHECK', durationInSeconds: 40, beats: [{ durationInSeconds: 40, text: 'd' }] },
    ],
  };
  const ch = deriveChapters(buildTimeline(long));
  assert.equal(ch[0].start, 0);
  assert.equal(ch[0].title, 'Intro');
  assert.ok(ch.length >= 3, 'YouTube needs at least 3 chapters');
  // s2 (MICRO_RECALL) lasts only 5s, so s3 (ITEM_BLOCK) begins 5s after it and
  // is the one that must be merged away.
  assert.ok(ch.some((c) => c.title === 'Quick check'), 'a stage 30s in earns a chapter');
  assert.ok(!ch.some((c) => c.title === 'Meet the words'), 'the stage <10s after the previous is merged away');
  for (let i = 1; i < ch.length; i++) {
    assert.ok(ch[i].start - ch[i - 1].start >= 10, `chapter ${i} is under 10s after the previous`);
  }
});

test('stage names are mapped to human chapter titles', () => {
  const t = buildTimeline(method());
  assert.equal(t.beats[0].stage, 'COLD_INPUT');
  const ch = deriveChapters(t);
  // COLD_INPUT begins at the intro boundary (10.27s), which clears the 10s gate,
  // so it earns a chapter. ITEM_BLOCK follows ~2s later and is merged away.
  assert.deepEqual(ch.map((c) => c.title), ['Intro', 'Listen']);
});

test('timestamp formatting', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(83.456), '00:01:23,456');
  assert.equal(vttTime(83.456), '00:01:23.456');
  assert.equal(srtTime(3723.5), '01:02:03,500');
  assert.equal(chapterTime(0), '0:00');
  assert.equal(chapterTime(83), '1:23');
  assert.equal(chapterTime(3723), '1:02:03');
});

test('a 999.5ms remainder carries into the next second instead of emitting ,1000', () => {
  assert.equal(srtTime(1.9999), '00:00:02,000');
  assert.equal(vttTime(59.9999), '00:01:00.000');
});
