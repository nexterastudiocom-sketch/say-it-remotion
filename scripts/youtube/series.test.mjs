// series.test.mjs — node:test coverage for series link resolution.
//
//   node --test scripts/youtube/series.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeriesLinks, findStaleLinks, watchUrl, playlistUrl } from './series.mjs';

const PL = 'PLcourse';

function log() {
  return [
    { lang: 'fr', lesson: 1, videoId: 'v1' },
    { lang: 'fr', lesson: 2, videoId: 'v2' },
    { lang: 'fr', lesson: 3, videoId: 'v3' },
  ];
}

test('middle lessons link both ways', () => {
  const links = resolveSeriesLinks(log(), PL);
  const l2 = links.get(2);
  assert.equal(l2.prev, `https://www.youtube.com/watch?v=v1&list=${PL}`);
  assert.equal(l2.next, `https://www.youtube.com/watch?v=v3&list=${PL}`);
  assert.equal(l2.playlist, `https://www.youtube.com/playlist?list=${PL}`);
});

test('the first lesson has no PREV and the last has no NEXT', () => {
  const links = resolveSeriesLinks(log(), PL);
  assert.equal(links.get(1).prev, '');
  assert.ok(links.get(1).next);
  assert.equal(links.get(3).next, '');
  assert.ok(links.get(3).prev);
});

test('NEXT/PREV keep the playlist context so the session chain survives', () => {
  const links = resolveSeriesLinks(log(), PL);
  assert.match(links.get(2).next, /&list=PLcourse$/);
});

test('an unpublished lesson is never linked to', () => {
  // Lesson 3 exists in the ledger but never got a videoId.
  const entries = [
    { lesson: 1, videoId: 'v1' },
    { lesson: 2, videoId: 'v2' },
    { lesson: 3, videoId: '' },
  ];
  const links = resolveSeriesLinks(entries, PL);
  assert.equal(links.get(2).next, '', 'no dead link to an unpublished lesson');
  assert.equal(links.has(3), false);
});

test('lessons published out of order still link in lesson order', () => {
  const entries = [
    { lesson: 3, videoId: 'v3' },
    { lesson: 1, videoId: 'v1' },
    { lesson: 2, videoId: 'v2' },
  ];
  const links = resolveSeriesLinks(entries, PL);
  assert.match(links.get(2).prev, /v=v1/);
  assert.match(links.get(2).next, /v=v3/);
});

test('a gap in the sequence links across it rather than dead-ending', () => {
  // Lesson 3 is not published yet; 2 should point at 4.
  const entries = [
    { lesson: 2, videoId: 'v2' },
    { lesson: 4, videoId: 'v4' },
  ];
  const links = resolveSeriesLinks(entries, PL);
  assert.match(links.get(2).next, /v=v4/);
  assert.match(links.get(4).prev, /v=v2/);
});

test('no playlist configured still yields usable next/prev links', () => {
  const links = resolveSeriesLinks(log(), '');
  assert.equal(links.get(2).playlist, '');
  assert.equal(links.get(2).next, 'https://youtu.be/v3');
});

test('string lesson numbers from the ledger are handled', () => {
  const entries = [
    { lesson: '1', videoId: 'v1' },
    { lesson: '2', videoId: 'v2' },
  ];
  const links = resolveSeriesLinks(entries, PL);
  assert.ok(links.get(1) && links.get(2));
  assert.match(links.get(1).next, /v=v2/);
});

test('malformed ledger rows are skipped, not crashed on', () => {
  const entries = [null, { lesson: 'x', videoId: 'v' }, { lesson: 1, videoId: 'v1' }];
  const links = resolveSeriesLinks(entries, PL);
  assert.equal(links.size, 1);
});

test('findStaleLinks flags a missing playlist but not a legitimate first/last', () => {
  const stale = findStaleLinks(log(), '');
  assert.equal(stale.length, 3, 'all three lack the playlist link');
  for (const s of stale) assert.deepEqual(s.missing, ['playlist']);

  const clean = findStaleLinks(log(), PL);
  assert.deepEqual(clean, [], 'first lesson lacking PREV is not stale — it has no predecessor');
});

test('url builders', () => {
  assert.equal(watchUrl('abc'), 'https://youtu.be/abc');
  assert.equal(watchUrl('abc', 'PL1'), 'https://www.youtube.com/watch?v=abc&list=PL1');
  assert.equal(watchUrl(''), '');
  assert.equal(playlistUrl('PL1'), 'https://www.youtube.com/playlist?list=PL1');
  assert.equal(playlistUrl(''), '');
});

test('an empty ledger resolves to nothing rather than throwing', () => {
  assert.equal(resolveSeriesLinks([], PL).size, 0);
  assert.equal(resolveSeriesLinks(undefined, PL).size, 0);
});
