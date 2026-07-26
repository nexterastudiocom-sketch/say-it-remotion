// Deterministic tests for the generation loop's testable core. No API calls,
// no rendering — fixtures on disk + the real ffprobe/ffmpeg validators.
//
//   node --test test/pipeline.test.mjs
//
// These prove: config loads and is self-consistent; the validators correctly
// PASS good inputs and FAIL bad ones; pronunciation is honestly reported as
// unverified while disabled; and summarize() rolls hard gates up correctly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from '../scripts/pipeline/lib.mjs';
import * as V from '../scripts/pipeline/validate.mjs';
import { normalizeFr, pronunciationConfidence } from '../scripts/pipeline/stt.mjs';

const TMP = path.join(ROOT, 'pipeline/.test-tmp');
const relTmp = (p) => path.relative(ROOT, path.join(TMP, p));

async function fixture(name, obj) {
  await mkdir(TMP, { recursive: true });
  const p = path.join(TMP, name);
  await writeFile(p, JSON.stringify(obj, null, 2));
  return relTmp(name);
}

test('config loads and thresholds are self-consistent', async () => {
  const cfg = await loadConfig();
  assert.ok(cfg.duration.minSeconds < cfg.duration.maxSeconds);
  assert.ok(cfg.duration.minSeconds <= cfg.duration.targetSeconds && cfg.duration.targetSeconds <= cfg.duration.maxSeconds);
  assert.equal(cfg.video.width, 3840);
  assert.ok(cfg.hardGates.includes('pronunciationVerified'));
  assert.ok(['auto', true, false].includes(cfg.pronunciation.enabled), 'pronunciation mode is valid');
});

test('validateSource passes a rich script, flags a thin one', async () => {
  const rich = { segments: [{ beats: Array.from({ length: 10 }, (_, i) => ({ voice: 'fr_woman', text: `bonjour ${i}`, line: i + 1 })) }], meta: { titleFr: 'Dire bonjour' } };
  const thin = { segments: [{ beats: [{ voice: 'fr_woman', text: 'bonjour', line: 1 }] }], meta: null };
  const good = await V.validateSource({ scriptJson: await fixture('rich.json', rich) });
  const bad = await V.validateSource({ scriptJson: await fixture('thin.json', thin) });
  assert.equal(good.find((c) => c.name === 'sourceValid').status, 'pass');
  assert.equal(bad.find((c) => c.name === 'sourceValid').status, 'needs-review');
});

test('validateSource flags empty spoken beats (no fabrication)', async () => {
  const holes = { segments: [{ beats: [...Array(9)].map((_, i) => ({ voice: 'fr_woman', text: i === 3 ? '' : 'ok', line: i + 1 })) }], meta: { titleFr: 'X' } };
  const checks = await V.validateSource({ scriptJson: await fixture('holes.json', holes) });
  assert.equal(checks.find((c) => c.name === 'sourceNoEmpty').status, 'fail');
});

test('validateSync passes an internally-consistent timeline, fails a drifted one', async () => {
  const cfg = await loadConfig();
  const good = { slides: [{ id: 's1', durationInSeconds: 3.0, beats: [{ durationInSeconds: 1.5 }, { durationInSeconds: 1.5 }] }] };
  const drift = { slides: [{ id: 's1', durationInSeconds: 9.9, beats: [{ durationInSeconds: 1.5 }, { durationInSeconds: 1.5 }] }] };
  assert.equal((await V.validateSync({ lessonJson: await fixture('good.json', good) }, cfg))[0].status, 'pass');
  assert.equal((await V.validateSync({ lessonJson: await fixture('drift.json', drift) }, cfg))[0].status, 'fail');
});

test('validateAudioClips fails when a referenced clip is missing', async () => {
  const cfg = await loadConfig();
  const lesson = { slides: [{ id: 's1', beats: [{ src: 'assets/audio/does-not-exist.mp3', durationInSeconds: 1.2 }] }] };
  const checks = await V.validateAudioClips({ lessonJson: await fixture('miss.json', lesson) }, cfg);
  assert.equal(checks.find((c) => c.name === 'assetsPresent').status, 'fail');
});

test('pronunciation is honestly unverified when no backend exists', async () => {
  const cfg = await loadConfig(); // ships "auto"
  const checks = await V.validatePronunciation({ lessonJson: 'x' }, cfg, { backend: null });
  const g = checks[0];
  assert.equal(g.name, 'pronunciationVerified');
  assert.equal(g.ok, false);
  assert.equal(g.status, 'needs-review');
  assert.match(g.detail, /UNVERIFIED/);
});

test('pronunciation scoring: exact/accents/drift', () => {
  assert.equal(normalizeFr("Ça va ?"), 'ca va');
  assert.equal(pronunciationConfidence('Bonjour', 'bonjour'), 1);          // exact
  assert.equal(pronunciationConfidence('Ça va bien', 'ca va bien'), 1);     // accents ignored
  assert.ok(pronunciationConfidence('Je voudrais un café', 'je voudrais un thé') < 1); // one wrong word
  assert.equal(pronunciationConfidence('Bonjour', ''), 0);                  // silence
});

test('pronunciation gate PASSES with an injected clean transcriber, FAILS a garbling one', async () => {
  const cfg = await loadConfig();
  const lesson = { slides: [{ id: 's1', beats: [
    { src: 'assets/audio/x.mp3', voice: 'fr_woman', text: 'Bonjour', durationInSeconds: 1 },
  ] }] };
  const rel = path.relative(ROOT, path.join(TMP, 'pron.json'));
  await fixture('pron.json', lesson);
  // point the clip at a real file that exists so existsSync passes
  const realClip = lesson.slides[0].beats[0];
  realClip.src = path.relative(path.join(ROOT, 'public'), path.join(ROOT, 'package.json')); // any existing file
  await fixture('pron.json', lesson);
  const clean = { name: 'mock', transcribe: async () => 'Bonjour' };
  const garbled = { name: 'mock', transcribe: async () => 'au revoir merci beaucoup' };
  const pass = await V.validatePronunciation({ lessonJson: rel }, cfg, { backend: clean });
  const fail = await V.validatePronunciation({ lessonJson: rel }, cfg, { backend: garbled });
  assert.equal(pass[0].status, 'pass');
  assert.equal(fail[0].status, 'fail');
});

test('summarize rolls hard gates into the right verdict', () => {
  const passOnly = V.summarize([{ name: 'a', hardGate: true, status: 'pass' }, { name: 'b', hardGate: true, status: 'pass' }]);
  assert.equal(passOnly.status, 'pass');
  const withReview = V.summarize([{ name: 'a', hardGate: true, status: 'pass' }, { name: 'p', hardGate: true, status: 'needs-review' }]);
  assert.equal(withReview.status, 'needs-review');
  const withFail = V.summarize([{ name: 'p', hardGate: true, status: 'needs-review' }, { name: 'd', hardGate: true, status: 'fail' }]);
  assert.equal(withFail.status, 'fail', 'a hard fail dominates needs-review');
});

test('probe reads the real rendered output when present (skips if absent)', async (t) => {
  const film = path.join(ROOT, 'out/films/Lesson-01-FR-final.mp4');
  if (!existsSync(film)) return t.skip('no rendered film on disk');
  const p = await V.probe(film);
  assert.equal(p.width, 3840);
  assert.equal(p.height, 2160);
  assert.equal(p.vcodec, 'h264');
  assert.ok(p.hasAudio);
});

test.after(async () => { if (existsSync(TMP)) await rm(TMP, { recursive: true, force: true }); });
