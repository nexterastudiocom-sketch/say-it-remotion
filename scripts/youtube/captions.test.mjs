// captions.test.mjs — node:test coverage for caption generation.
//
//   node --test scripts/youtube/captions.test.mjs
//
// The gap-leak tests are the important ones: they are what stops a caption
// track from painting a French answer into the silence a learner is meant to
// fill from memory (rules X-06 / I-05).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaptions, buildCues, cuesForBeat, wrapLines, beatLanguage,
  assertNoGapLeak, toSRT, toVTT,
} from './captions.mjs';
import { buildTimeline } from './timing.mjs';

// A retrieval drill: English prompt -> SILENT GAP -> French reveal.
// This is the exact shape the leak rule exists for.
function retrievalDrill() {
  return {
    slides: [
      {
        id: 'drill', stage: 'ITEM_BLOCK', durationInSeconds: 9.0,
        beats: [
          { durationInSeconds: 2.0, text: 'How do you say seven?', voice: 'en_woman', register: 'instruction' },
          { durationInSeconds: 4.0 },                       // the retrieval gap — silent
          { durationInSeconds: 3.0, text: 'sept', voice: 'fr_woman', register: 'word' },
        ],
      },
    ],
  };
}

test('a silent retrieval gap produces no cue', () => {
  const { cues } = buildCues(retrievalDrill());
  assert.equal(cues.length, 2, 'only the two spoken beats are captioned');
  assert.deepEqual(cues.map((c) => c.text), ['How do you say seven?', 'sept']);
});

test('no cue overlaps the retrieval gap', () => {
  const method = retrievalDrill();
  const { timeline, cues } = buildCues(method);
  const gap = timeline.beats.find((b) => !b.isSpeech);
  for (const c of cues) {
    assert.ok(
      c.end <= gap.startSec + 1e-9 || c.start >= gap.endSec - 1e-9,
      `cue "${c.text}" (${c.start}-${c.end}) intrudes on the gap ${gap.startSec}-${gap.endSec}`
    );
  }
});

test('the French reveal is captioned only while it is spoken', () => {
  const { timeline, cues } = buildCues(retrievalDrill());
  const reveal = timeline.beats.find((b) => b.voice === 'fr_woman');
  const cue = cues.find((c) => c.text === 'sept');
  assert.equal(cue.start, reveal.startSec);
  assert.equal(cue.end, reveal.endSec);
  assert.equal(cue.lang, 'fr');
});

test('assertNoGapLeak throws when a cue is stretched into the gap', () => {
  const method = retrievalDrill();
  const { timeline, cues } = buildCues(method);
  assert.ok(assertNoGapLeak(cues, timeline));

  // Simulate the classic bug: extend a cue to "fill" dead air.
  const bad = cues.map((c, i) => (i === 0 ? { ...c, end: c.end + 3 } : c));
  assert.throws(() => assertNoGapLeak(bad, timeline), /X-06|retrieval gap|silence/i);
});

test('assertNoGapLeak throws on a cue attributed to a silent beat', () => {
  const method = retrievalDrill();
  const { timeline, cues } = buildCues(method);
  const gap = timeline.beats.find((b) => !b.isSpeech);
  const bad = [...cues, { start: gap.startSec, end: gap.endSec, text: 'sept', lines: ['sept'], beatIndex: gap.index }];
  assert.throws(() => assertNoGapLeak(bad, timeline), /silent beat|retrieval gap/i);
});

test('long text splits into sub-cues that stay inside the beat', () => {
  const long = 'You walk into a bakery. A woman is behind the counter. Greet her using whichever greeting fits the time where you are right now, and thank her.';
  const method = {
    slides: [{
      id: 's', stage: 'TRANSFER_TASK', durationInSeconds: 12,
      beats: [{ durationInSeconds: 12, text: long, voice: 'en_woman' }],
    }],
  };
  const { timeline, cues } = buildCues(method);
  const beat = timeline.beats[0];
  assert.ok(cues.length > 1, 'long narration is split');
  assert.equal(cues[0].start, beat.startSec);
  assert.equal(cues[cues.length - 1].end, beat.endSec, 'the last cue is pinned to the beat end');
  for (const c of cues) {
    assert.ok(c.start >= beat.startSec - 1e-9 && c.end <= beat.endSec + 1e-9, 'sub-cue stays in the beat');
  }
  // Reassembling the cues must reproduce the narration verbatim.
  assert.equal(cues.map((c) => c.text.replace(/\n/g, ' ')).join(' '), long);
});

test('cues are never shorter than is readable when the beat allows', () => {
  const method = {
    slides: [{
      id: 's', durationInSeconds: 3, stage: 'ITEM_BLOCK',
      beats: [{ durationInSeconds: 3, text: 'a '.repeat(60).trim(), voice: 'en_woman' }],
    }],
  };
  const { cues } = buildCues(method);
  for (const c of cues) assert.ok(c.end - c.start >= 0.5, `cue too brief: ${c.end - c.start}s`);
});

test('wrapLines respects the line length and never drops words', () => {
  const text = 'Greet her using whichever greeting fits the time where you are right now';
  const lines = wrapLines(text, 42);
  for (const l of lines) assert.ok(l.length <= 42, `line too long: "${l}"`);
  assert.equal(lines.join(' '), text);
});

test('beatLanguage reads the voice prefix', () => {
  assert.equal(beatLanguage({ voice: 'en_woman' }), 'en');
  assert.equal(beatLanguage({ voice: 'fr_man' }), 'fr');
  assert.equal(beatLanguage({ voice: 'es_woman' }), 'es');
  assert.equal(beatLanguage({ voice: null }, 'it'), 'it');
});

test('empty and silent beats yield nothing', () => {
  assert.deepEqual(cuesForBeat({ isSpeech: false, text: null }), []);
  assert.deepEqual(cuesForBeat({ isSpeech: true, text: '' }), []);
});

test('SRT is well formed and ascending', () => {
  const { cues } = buildCues(retrievalDrill());
  const srt = toSRT(cues);
  // The first cue starts at the intro boundary: 308 frames / 30fps = 10.267s.
  assert.match(srt, /^1\n00:00:10,267 --> 00:00:12,267\nHow do you say seven\?/);
  const stamps = [...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g)];
  assert.equal(stamps.length, cues.length);
  for (const [, a, b] of stamps) assert.ok(a < b, `${a} must precede ${b}`);
});

test('VTT carries the required header', () => {
  const { cues } = buildCues(retrievalDrill());
  assert.match(toVTT(cues), /^WEBVTT\n\n/);
});

test('buildCaptions validates and reports stats', () => {
  const out = buildCaptions(retrievalDrill());
  assert.equal(out.stats.cues, 2);
  assert.equal(out.stats.speechBeats, 2);
  assert.equal(out.stats.silentBeats, 1);
  assert.equal(out.stats.targetLangCues, 1, 'one French cue — the long-tail SEO surface');
  assert.ok(out.srt.length > 0 && out.vtt.length > 0);
});
