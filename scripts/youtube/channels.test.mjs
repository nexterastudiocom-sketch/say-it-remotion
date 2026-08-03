// channels.test.mjs — node:test coverage for the pure planning logic.
//
//   node --test scripts/youtube/channels.test.mjs
//
// The network calls are thin wrappers; the decisions worth testing are "what
// would we write, and when do we refuse".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planChannelUpdate, channelHealth, playlistTitle, playlistDescription, langName,
} from './channels.mjs';

const discovered = {
  channelId: 'UC_new_channel',
  title: 'Mosaic French',
  playlists: { A1: 'PL_a1' },
};

test('an empty config is filled in', () => {
  const plan = planChannelUpdate({ channelId: '', playlists: { A1: '' } }, discovered);
  assert.equal(plan.ok, true);
  assert.equal(plan.next.channelId, 'UC_new_channel');
  assert.equal(plan.next.playlists.A1, 'PL_a1');
  assert.equal(plan.next.channelTitle, 'Mosaic French');
  assert.equal(plan.changes.length, 3);
});

test('re-connecting the same channel is a no-op', () => {
  const entry = { channelId: 'UC_new_channel', channelTitle: 'Mosaic French', playlists: { A1: 'PL_a1' } };
  const plan = planChannelUpdate(entry, discovered);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.changes, [], 'nothing to write');
});

test('a different channel is REFUSED — this is the wrong-account guard', () => {
  const entry = { channelId: 'UC_existing', playlists: { A1: 'PL_old' } };
  const plan = planChannelUpdate(entry, discovered);
  assert.equal(plan.ok, false);
  assert.match(plan.conflict, /UC_existing/);
  assert.match(plan.conflict, /UC_new_channel/);
  assert.equal(plan.next.channelId, 'UC_existing', 'config is left untouched');
});

test('--force overrides the guard', () => {
  const entry = { channelId: 'UC_existing', playlists: { A1: 'PL_old' } };
  const plan = planChannelUpdate(entry, discovered, { force: true });
  assert.equal(plan.ok, true);
  assert.equal(plan.next.channelId, 'UC_new_channel');
});

test('a channel with no id from YouTube is rejected', () => {
  const plan = planChannelUpdate({ channelId: '' }, { channelId: '' });
  assert.equal(plan.ok, false);
  assert.match(plan.conflict, /no channel id/i);
});

test('existing playlist levels are preserved when a new one is added', () => {
  const entry = { channelId: 'UC_new_channel', playlists: { A1: 'PL_a1', A2: 'PL_a2' } };
  const plan = planChannelUpdate(entry, { ...discovered, playlists: { B1: 'PL_b1' } });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.next.playlists, { A1: 'PL_a1', A2: 'PL_a2', B1: 'PL_b1' });
});

test('an empty discovered playlist id never clobbers a real one', () => {
  const entry = { channelId: 'UC_new_channel', playlists: { A1: 'PL_a1' } };
  const plan = planChannelUpdate(entry, { ...discovered, playlists: { A1: '' } });
  assert.equal(plan.next.playlists.A1, 'PL_a1');
});

test('health reports every reason a channel is not ready', () => {
  const h = channelHealth('fr', { channelId: '', playlists: { A1: '' } }, { hasToken: false });
  assert.equal(h.connected, false);
  assert.ok(h.problems.includes('not authorised'));
  assert.ok(h.problems.includes('no channelId'));
  assert.ok(h.problems.some((p) => /no playlist id for A1/.test(p)));
});

test('health is clean once everything is set', () => {
  const h = channelHealth(
    'fr',
    { channelId: 'UC_x', channelTitle: 'Mosaic French', playlists: { A1: 'PL_a1' } },
    { hasToken: true, publishedCount: 17 }
  );
  assert.equal(h.connected, true);
  assert.deepEqual(h.problems, []);
  assert.equal(h.publishedCount, 17);
});

test('playlist titles lead with the head keyword', () => {
  assert.equal(playlistTitle('fr', 'A1'), 'French for Beginners — Full A1 Course');
  assert.equal(playlistTitle('es', 'A2'), 'Spanish for Beginners — Full A2 Course');
  // "<Language> for Beginners" must appear before any truncation point.
  assert.ok(playlistTitle('pt', 'A1').indexOf('Portuguese for Beginners') === 0);
});

test('playlist description carries the app link when configured', () => {
  const d = playlistDescription('fr', 'A1', 'https://mosaic.app/fr');
  assert.match(d, /French A1 lesson in order/);
  assert.match(d, /https:\/\/mosaic\.app\/fr/);
  assert.ok(!playlistDescription('fr', 'A1').includes('🃏'), 'no dangling link block without a url');
});

test('langName covers the configured channels and degrades safely', () => {
  assert.equal(langName('fr'), 'French');
  assert.equal(langName('de'), 'German');
  assert.equal(langName('zz'), 'ZZ');
});
