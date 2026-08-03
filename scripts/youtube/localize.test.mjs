// localize.test.mjs — node:test coverage for localization.
//
//   node --test scripts/youtube/localize.test.mjs
//
// The verification tests are the point. A model instruction not to translate
// the taught words is not a guarantee; rejecting a translation that did is.
// The model is injected, so none of this touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInvariants, verifyLocalization, parseModelJson, buildPrompt,
  localizeOne, localizeAll, localeName, DEFAULT_LOCALES,
} from './localize.mjs';

const ITEMS = ['sept', 'six', 'vingt', 'elle est'];

const DESCRIPTION = [
  "Learn French by speaking it. In this A1 lesson you'll say 4 new French words out loud.",
  '',
  '🃏 Free flashcard practice for this lesson: https://mosaic.app/fr',
  '',
  '⏱️ CHAPTERS',
  '0:00 Intro',
  '0:10 Listen',
  '7:09 Meet the words',
  '',
  "🗣️ WORDS YOU'LL SPEAK",
  'sept — seven',
  'six — six',
  'vingt — twenty',
  'elle est — she is',
  '',
  '▶️ FULL FRENCH A1 COURSE: https://www.youtube.com/playlist?list=PLx',
  '',
  '#LearnFrench #FrenchForBeginners #FrenchA1',
].join('\n');

const TITLE = 'French for Beginners #04 — Numbers 1-20 | Speak 4 Words (A1)';

test('invariants are extracted from the description', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  assert.deepEqual(inv.timestamps, ['0:00', '0:10', '7:09']);
  assert.deepEqual(inv.items, ITEMS);
  assert.ok(inv.urls.includes('https://mosaic.app/fr'));
  assert.ok(inv.urls.includes('https://www.youtube.com/playlist?list=PLx'));
  assert.deepEqual(inv.hashtags, ['#LearnFrench', '#FrenchForBeginners', '#FrenchA1']);
});

test('an item the description does not print is not required', () => {
  const inv = extractInvariants(DESCRIPTION, [...ITEMS, 'croissant']);
  assert.ok(!inv.items.includes('croissant'));
});

test('a good translation passes', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  const es = {
    title: 'Francés para principiantes #04 — Números 1-20 | Habla 4 palabras (A1)',
    description: DESCRIPTION
      .replace('Learn French by speaking it.', 'Aprende francés hablándolo.')
      .replace('sept — seven', 'sept — siete')
      .replace('vingt — twenty', 'vingt — veinte')
      .replace('elle est — she is', 'elle est — ella es'),
  };
  assert.ok(verifyLocalization(es, inv, 'es'));
});

test('REJECTED when the taught French words were translated', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  // The classic failure: "sept — seven" becomes "siete — siete".
  const bad = { title: 'ok', description: DESCRIPTION.replace('sept — seven', 'siete — siete') };
  assert.throws(
    () => verifyLocalization(bad, inv, 'es'),
    /taught words were altered or dropped.*sept/s
  );
});

test('REJECTED when a chapter timestamp was reformatted', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  const bad = { title: 'ok', description: DESCRIPTION.replace('7:09', '7.09') };
  assert.throws(() => verifyLocalization(bad, inv, 'de'), /timestamps changed.*7:09/s);
});

test('REJECTED when a URL was altered', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  const bad = { title: 'ok', description: DESCRIPTION.replace('https://mosaic.app/fr', 'https://mosaic.app/es') };
  assert.throws(() => verifyLocalization(bad, inv, 'es'), /URLs changed/);
});

test('REJECTED when the title or description breaks YouTube limits', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  assert.throws(() => verifyLocalization({ title: 'x'.repeat(101), description: DESCRIPTION }, inv, 'es'), /101 chars/);
  assert.throws(() => verifyLocalization({ title: 'ok', description: '' }, inv, 'es'), /empty description/);
  assert.throws(() => verifyLocalization({ title: '', description: DESCRIPTION }, inv, 'es'), /empty title/);
});

test('all problems are reported at once so a retry can fix them together', () => {
  const inv = extractInvariants(DESCRIPTION, ITEMS);
  const bad = {
    title: 'ok',
    description: DESCRIPTION.replace('sept — seven', 'siete — siete').replace('7:09', '7.09'),
  };
  try {
    verifyLocalization(bad, inv, 'es');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(e.problems.length, 2);
  }
});

test('the prompt names the words that must not be translated', () => {
  const p = buildPrompt({ title: TITLE, description: DESCRIPTION, locale: 'es', courseLang: 'fr', items: ITEMS });
  assert.match(p, /into Spanish/);
  assert.match(p, /teaches French to beginners/);
  assert.match(p, /NEVER translate the French words/);
  assert.match(p, /sept, six, vingt, elle est/);
  // The interpolation in the hashtag rule must actually resolve.
  assert.ok(!p.includes('${'), 'no unresolved template placeholders');
});

test('model JSON is parsed through fences and padding', () => {
  assert.deepEqual(parseModelJson('{"title":"a","description":"b"}'), { title: 'a', description: 'b' });
  assert.deepEqual(parseModelJson('```json\n{"title":"a","description":"b"}\n```'), { title: 'a', description: 'b' });
  assert.deepEqual(parseModelJson('Sure!\n{"title":"a","description":"b"}\nHope that helps'), { title: 'a', description: 'b' });
  assert.throws(() => parseModelJson('no json here'), /no JSON object/);
  assert.throws(() => parseModelJson('{"title":"a"}'), /missing title\/description/);
});

test('a rejected translation is retried with the failures fed back', async () => {
  const calls = [];
  const generate = async ({ user }) => {
    calls.push(user);
    // First attempt translates the taught word; second gets it right.
    const description = calls.length === 1
      ? DESCRIPTION.replace('sept — seven', 'siete — siete')
      : DESCRIPTION.replace('sept — seven', 'sept — siete');
    return { text: JSON.stringify({ title: 'Francés #04', description }) };
  };
  const r = await localizeOne({
    title: TITLE, description: DESCRIPTION, locale: 'es', courseLang: 'fr', items: ITEMS, generate,
  });
  assert.equal(r.attempts, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /previous attempt was rejected/);
  assert.match(calls[1], /taught words were altered/);
  assert.ok(r.description.includes('sept — siete'));
});

test('a translation that never verifies throws rather than shipping', async () => {
  const generate = async () => ({
    text: JSON.stringify({ title: 'x', description: DESCRIPTION.replace('sept', 'siete') }),
  });
  await assert.rejects(
    () => localizeOne({ title: TITLE, description: DESCRIPTION, locale: 'es', courseLang: 'fr', items: ITEMS, generate }),
    /rejected/
  );
});

test('one failing locale does not sink the others', async () => {
  const generate = async ({ user }) => {
    const failing = /into German/.test(user);
    const description = failing ? DESCRIPTION.replace('sept', 'sieben') : DESCRIPTION;
    return { text: JSON.stringify({ title: 'T', description }) };
  };
  const { localizations, failures } = await localizeAll({
    title: TITLE, description: DESCRIPTION, locales: ['es', 'de', 'it'],
    courseLang: 'fr', items: ITEMS, generate,
  });
  assert.deepEqual(Object.keys(localizations), ['es', 'it']);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].locale, 'de');
});

test('defaults and names', () => {
  assert.deepEqual(DEFAULT_LOCALES, ['es', 'pt', 'de', 'it']);
  assert.equal(localeName('es'), 'Spanish');
  assert.equal(localeName('zh-Hans'), 'Simplified Chinese');
  assert.equal(localeName('xx'), 'xx');
});
