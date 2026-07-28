// metadata.test.mjs — node:test coverage for the buildMetadata throwing assertions.
//
//   node --test scripts/youtube/metadata.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetadata } from './metadata.mjs';

function validLesson() {
  return {
    meta: {
      lesson: 1,
      language: 'fr',
      level: 'A1',
      title: 'Greetings & goodbyes',
      can_do: 'I can greet someone and take my leave.',
      items: ['bonjour', 'salut', 'merci', "s'il vous plaît", 'oui', 'non'],
    },
    chapters: [
      { start: 0, title: 'Intro' },
      { start: 12, title: 'Your goal' },
      { start: 30, title: 'Listen' },
      { start: 55, title: 'Meet the words' },
    ],
    words: [
      { word: 'bonjour', gloss: 'hello / good morning' },
      { word: 'salut', gloss: 'hi / bye, casual' },
      { word: 'merci', gloss: 'thank you' },
      { word: "s'il vous plaît", gloss: 'please' },
      { word: 'oui', gloss: 'yes' },
      { word: 'non', gloss: 'no' },
    ],
    recordingDate: '2026-07-28',
    links: {},
  };
}

const seoConfig = {
  defaultLanguage: 'en',
  defaultAudioLanguage: 'en',
  appUrl: 'https://mosaic.app/fr',
  playlists: { A1: '' },
};

test('valid lesson builds a complete, spec-compliant resource', () => {
  const r = buildMetadata(validLesson(), {}, seoConfig);
  assert.ok(r.snippet.title.length <= 100);
  assert.ok(r.snippet.title.startsWith('French for Beginners #01 —'));
  assert.ok(r.snippet.description.length <= 5000);
  assert.ok(r.snippet.tags.join('').length <= 500);
  assert.equal(r.snippet.categoryId, '27');
  assert.equal(r.snippet.defaultLanguage, 'en');
  assert.equal(r.status.privacyStatus, 'private');
  assert.equal(r.status.selfDeclaredMadeForKids, false);
  assert.equal(r.status.containsSyntheticMedia, true);
  assert.equal(r.status.license, 'youtube');
  assert.equal(r.status.embeddable, true);
  assert.ok(r.recordingDetails.recordingDate.startsWith('2026-07-28'));
  // words appear in the description
  assert.ok(r.snippet.description.includes('bonjour — hello / good morning'));
});

test('title over 100 chars throws', () => {
  const over = 'x'.repeat(101);
  assert.throws(() => buildMetadata(validLesson(), { title: over }, seoConfig), /title exceeds 100/);
});

test('description over 5000 chars throws', () => {
  const over = 'x'.repeat(5001);
  assert.throws(() => buildMetadata(validLesson(), { description: over }, seoConfig), /description exceeds 5000/);
});

test('tags over 500 chars (join("")) throws', () => {
  const big = Array.from({ length: 20 }, (_, i) => 'a'.repeat(30) + i); // > 500 concatenated
  assert.throws(() => buildMetadata(validLesson(), { tags: big }, seoConfig), /tags exceed 500/);
});

test('fewer than 3 chapters throws', () => {
  const l = validLesson();
  l.chapters = [
    { start: 0, title: 'Intro' },
    { start: 12, title: 'Your goal' },
  ];
  assert.throws(() => buildMetadata(l, {}, seoConfig), /at least 3 chapters/);
});

test('first chapter not at 0 throws', () => {
  const l = validLesson();
  l.chapters[0].start = 5;
  assert.throws(() => buildMetadata(l, {}, seoConfig), /first chapter must start at 0/);
});

test('chapter gap under 10s throws', () => {
  const l = validLesson();
  l.chapters = [
    { start: 0, title: 'Intro' },
    { start: 12, title: 'Your goal' },
    { start: 17, title: 'Listen' }, // only 5s after the previous
    { start: 40, title: 'Meet the words' },
  ];
  assert.throws(() => buildMetadata(l, {}, seoConfig), /must be >= 10s and ascending/);
});

test('wrong categoryId (via override) throws', () => {
  assert.throws(
    () => buildMetadata(validLesson(), { snippet: { categoryId: '22' } }, seoConfig),
    /categoryId must be "27"/
  );
});

test('selfDeclaredMadeForKids true (via override) throws', () => {
  assert.throws(
    () => buildMetadata(validLesson(), { status: { selfDeclaredMadeForKids: true } }, seoConfig),
    /selfDeclaredMadeForKids must be false/
  );
});

test('overrides win — hand-tuned title is used', () => {
  const custom = 'French for Beginners #01 — My Hand-Tuned Title (A1)';
  const r = buildMetadata(validLesson(), { title: custom }, seoConfig);
  assert.equal(r.snippet.title, custom);
});

test('structured override deep-merges without dropping siblings', () => {
  const r = buildMetadata(validLesson(), { status: { license: 'creativeCommon' } }, seoConfig);
  assert.equal(r.status.license, 'creativeCommon');
  // sibling status fields survive the merge
  assert.equal(r.status.privacyStatus, 'private');
  assert.equal(r.status.selfDeclaredMadeForKids, false);
});
