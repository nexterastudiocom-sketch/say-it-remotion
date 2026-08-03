// keywords.test.mjs — node:test coverage for keyword research.
//
//   node --test scripts/youtube/keywords.test.mjs
//
// The relevance tests are the point. A misleading tag can get a video locked
// private with no appeal, so "would this phrase be a lie about this lesson" has
// to be answered correctly, not approximately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRelevant, lessonVocabulary, seedsForLesson, parseSuggestResponse,
  scoreSuggestions, buildTags, titleCandidates, tokenize, researchLesson, phraseToTopic, authoredTopic,
} from './keywords.mjs';

// Lesson 4 as actually authored: nine numbers up to twenty, plus three pronouns.
const META = {
  lesson: 4,
  language: 'fr',
  level: 'A1',
  title: 'Count to twenty and say what someone is',
  can_do: 'I can count to twenty and say what someone is.',
  items: ['sept', 'six', 'treize', 'trois', 'un', 'vingt', 'zéro', 'quinze', 'seize', 'elle est', 'elles sont', 'il est'],
  glosses: ['seven', 'six', 'thirteen', 'three', 'one', 'twenty', 'zero', 'fifteen', 'sixteen', 'she is', 'they are (f)', 'he is'],
};

const VOCAB = lessonVocabulary(META);

test('a truthful numeric claim is kept', () => {
  assert.equal(isRelevant('learn french numbers 1-20', VOCAB), true);
  assert.equal(isRelevant('french numbers 1 to 20', VOCAB), true);
});

test('a numeric claim beyond the lesson is REJECTED', () => {
  assert.equal(isRelevant('learn french numbers 1-1000', VOCAB), false);
  assert.equal(isRelevant('learn french numbers 1-60', VOCAB), false);
  assert.equal(isRelevant('french numbers 1 to 100', VOCAB), false);
});

test('a format the video does not have is REJECTED', () => {
  assert.equal(isRelevant('learn french numbers song', VOCAB), false);
  assert.equal(isRelevant('learn french with alexa', VOCAB), false);
  assert.equal(isRelevant('french numbers rap', VOCAB), false);
});

test('a competitor brand is REJECTED', () => {
  assert.equal(isRelevant('learn french duolingo', VOCAB), false);
  assert.equal(isRelevant('french babbel review', VOCAB), false);
});

test('generic learning vocabulary is always fair', () => {
  assert.equal(isRelevant('learn french for beginners', VOCAB), true);
  assert.equal(isRelevant('french pronunciation practice', VOCAB), true);
  assert.equal(isRelevant('easy french lesson a1', VOCAB), true);
});

test('the lesson\'s own taught words are fair', () => {
  assert.equal(isRelevant('how to say seven in french', VOCAB), true);
  assert.equal(isRelevant('vingt', VOCAB), true);
  // A word from a different lesson is not.
  assert.equal(isRelevant('how to say croissant in french', VOCAB), false);
});

test('accents fold so the taught word still matches', () => {
  assert.equal(isRelevant('zero in french', VOCAB), true, 'zéro folded to zero');
  assert.deepEqual(tokenize('zéro'), ['zero']);
});

test('an empty phrase is not relevant', () => {
  assert.equal(isRelevant('', VOCAB), false);
  assert.equal(isRelevant('   ', VOCAB), false);
});

test('a lesson that teaches no numbers rejects all numeric claims', () => {
  const greetings = {
    lesson: 1, language: 'fr', level: 'A1', title: 'Greetings',
    items: ['bonjour', 'salut'], glosses: ['hello', 'hi'],
  };
  const v = lessonVocabulary(greetings);
  assert.equal(v.maxNumber, null);
  assert.equal(isRelevant('learn french numbers 1-20', v), false);
  assert.equal(isRelevant('how to say hello in french', v), true);
});

test('seeds cover head terms, the topic, and the taught words', () => {
  const seeds = seedsForLesson(META);
  assert.ok(seeds.includes('learn french'));
  assert.ok(seeds.includes('french for beginners'));
  assert.ok(seeds.some((s) => s.includes('count to twenty')));
  assert.ok(seeds.some((s) => s === 'how to say seven in french'));
  // A parenthetical gloss must not leak into a search phrase.
  assert.ok(!seeds.some((s) => s.includes('(')));
});

test('the JSONP autocomplete response is parsed', () => {
  const body = 'window.google.ac.h(["learn french",[["learn french",0,[512]],["learn french fast",0,[512]]],{"a":"b"}])';
  assert.deepEqual(parseSuggestResponse(body), ['learn french', 'learn french fast']);
});

test('a malformed autocomplete response yields nothing rather than throwing', () => {
  assert.deepEqual(parseSuggestResponse('not jsonp'), []);
  assert.deepEqual(parseSuggestResponse('window.google.ac.h(nonsense)'), []);
  assert.deepEqual(parseSuggestResponse(''), []);
});

test('ranking favours early positions and phrases seen across seeds', () => {
  const ranked = scoreSuggestions({
    'learn french': ['french a', 'french b', 'french c'],
    'french for beginners': ['french c', 'french d'],
  });
  const c = ranked.find((r) => r.phrase === 'french c');
  const b = ranked.find((r) => r.phrase === 'french b');
  const a = ranked.find((r) => r.phrase === 'french a');
  assert.equal(c.seeds, 2);
  assert.ok(c.score > b.score, 'a phrase two seeds surfaced outranks a single-seed one');
  // Centrality beats a single top hit: "french c" is only 3rd for one seed but
  // 1st for another, which makes it more central to the topic than "french a".
  assert.ok(c.score > a.score);
  assert.equal(ranked[0].phrase, 'french c');
});

test('"numbers" is fair for a counting lesson and a lie for a greetings one', () => {
  assert.equal(isRelevant('learn french numbers', VOCAB), true);
  assert.equal(isRelevant('french counting practice', VOCAB), true);

  const greetings = lessonVocabulary({
    lesson: 1, language: 'fr', level: 'A1', title: 'Greetings',
    items: ['bonjour'], glosses: ['hello'],
  });
  assert.equal(isRelevant('learn french numbers', greetings), false);
  assert.equal(isRelevant('french counting practice', greetings), false);
});

test('tags stay within the 500-character budget and never duplicate', () => {
  const many = Array.from({ length: 60 }, (_, i) => `french search phrase number ${i}`);
  const tags = buildTags(META, many);
  assert.ok(tags.join('').length <= 500, `tags are ${tags.join('').length} chars`);
  assert.equal(new Set(tags).size, tags.length, 'no duplicate tags');
  assert.ok(tags.includes('learn french'), 'head terms are kept');
});

test('title candidates keep the spec shape and the 100-char cap', () => {
  const titles = titleCandidates(META, ['learn french numbers 1-20', 'french numbers for beginners']);
  assert.ok(titles.length > 0);
  for (const t of titles) {
    assert.ok(t.length <= 100, `title is ${t.length} chars`);
    assert.match(t.title, /^French for Beginners #04 — .+ \| Speak 12 Words \(A1\)$/);
  }
  assert.equal(titles[0].topic, META.title, 'the authored title leads');
  assert.ok(titles.some((t) => /Numbers 1-20/.test(t.title)));
});

test('a search phrase that is not a topic is not offered as a title', () => {
  // These are all real autocomplete hits that used to yield titles like
  // "French for Beginners #04 — Lessons" — worse than the authored title.
  const titles = titleCandidates(META, [
    'learn french', 'french lessons', 'french a1', 'french for beginners conversation',
  ]);
  assert.equal(titles.length, 1, 'only the authored title survives');
  assert.equal(titles[0].topic, META.title);
});

test('phraseToTopic keeps substance and drops scaffolding', () => {
  const v = lessonVocabulary(META);
  assert.equal(phraseToTopic('learn french numbers 1-20', META, v), 'Numbers 1-20');
  assert.equal(phraseToTopic('french lessons', META, v), '');
  assert.equal(phraseToTopic('learn french', META, v), '');
  assert.equal(phraseToTopic('french for beginners', META, v), '');
  // One specific word alone is too thin to headline a lesson.
  assert.equal(phraseToTopic('how to say seven in french', META, v), '');
});

test('an overlong topic is dropped rather than producing an invalid title', () => {
  const titles = titleCandidates(META, ['x'.repeat(200)]);
  for (const t of titles) assert.ok(t.length <= 100);
});

test('researchLesson works fully offline with injected suggestions', async () => {
  const bySeed = {
    'learn french': ['learn french numbers 1-20', 'learn french numbers song', 'learn french duolingo'],
    'french for beginners': ['french for beginners', 'learn french numbers 1-20'],
  };
  const r = await researchLesson(META, { bySeed });
  const keptPhrases = r.kept.map((k) => k.phrase);
  assert.ok(keptPhrases.includes('learn french numbers 1-20'));
  assert.ok(!keptPhrases.includes('learn french numbers song'));
  assert.ok(!keptPhrases.includes('learn french duolingo'));
  assert.equal(r.rejected.length, 2);
  assert.ok(r.tags.length > 0 && r.titles.length > 0);
});

test('the authored topic falls back to the can-do when meta.title is empty', () => {
  // meta.title is empty in practice on real lessons; metadata.mjs derives the
  // topic from can_do, and losing that here dropped the authored title out of
  // the candidate list entirely.
  const noTitle = { ...META, title: '' };
  assert.equal(authoredTopic(noTitle), 'Count to twenty and say what someone is');
  assert.equal(authoredTopic({ title: 'Greetings' }), 'Greetings');
  assert.equal(authoredTopic({}), '');

  const titles = titleCandidates(noTitle, ['learn french numbers 1-20']);
  assert.equal(titles[0].topic, 'Count to twenty and say what someone is');
});

test('an overlong authored topic is trimmed to fit, not dropped', () => {
  const wordy = { ...META, title: 'Count to twenty and say what someone is and also describe them in detail at length' };
  const titles = titleCandidates(wordy, []);
  assert.equal(titles.length, 1, 'the authored title survives');
  assert.ok(titles[0].length <= 100);
  assert.ok(titles[0].topic.length < wordy.title.length, 'trimmed at a word boundary');
  assert.ok(!/\s$/.test(titles[0].topic));
});
