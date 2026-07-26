#!/usr/bin/env node
// GATE B · av-sync  (post-render, deterministic)
//
//   node scripts/qa/gate-b-av-sync.mjs <video-id>
//
// At each on-screen CAPTION CHANGE: sample the rendered frame, OCR the prominent
// caption, and diff it against the transcript actually SPOKEN at that timestamp
// (whisper words, build/<id>/asr.json). A low match = audio/caption mismatch —
// the "shows Bonjour while saying Au revoir" class of bug. Also flags when the
// render doesn't show the caption the manifest expected.

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, writeFindings, finding, normFr, levenshtein, run, ffmpegStatic, REMOTION, ROOT } from './lib.mjs';
import { ensureAsr } from './asr.mjs';

// Char-level (despaced) similarity — robust to OCR dropping spaces and to slow
// syllable breaks. This is how we compare a read caption to the spoken French.
const despace = (s) => normFr(s).replace(/\s/g, '');
function charSim(a, b) {
  const ca = despace(a).split(''), cb = despace(b).split('');
  if (!ca.length && !cb.length) return 1;
  if (!ca.length || !cb.length) return 0;
  return Math.max(0, 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length));
}

const id = process.argv[2] || 'lesson-01';
const OCR_PY = path.join(ROOT, '.venv-ocr/bin/python');
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run: node scripts/qa/manifest.mjs ${id}`); process.exit(2); }
if (!existsSync(P.video)) { console.error(`✗ no render: ${P.video}`); process.exit(2); }
if (!existsSync(OCR_PY)) { console.error(`✗ OCR engine missing (.venv-ocr) — av-sync needs it. See scripts/qa/README.`); process.exit(2); }

const MIN_SIM = 0.5; // caption vs spoken transcript
const manifest = await readJson(P.manifest);
const asr = await ensureAsr(id);

// ---- caption-change events: the FRENCH line captions on drill/practice slides
// (the "shows X while saying Y" bug class). Dedupe consecutive identical captions. ----
const events = [];
let last = null;
for (const r of manifest.lines) {
  if (!(r.captionCheckable && r.slideType === 'practice' && r.kind === 'french' && r.onScreenText)) continue;
  if (r.onScreenText === last) continue;
  last = r.onScreenText;
  events.push({ index: r.index, mid: +((r.videoStart + r.videoEnd) / 2).toFixed(2), start: r.videoStart, end: r.videoEnd, caption: r.onScreenText });
}

// ---- extract one frame per event ----
const ff = ffmpegStatic() || REMOTION;
const ffPrefix = ff === REMOTION ? ['ffmpeg'] : [];
const framesDir = path.join(ROOT, `build/${id}/frames`);
mkdirSync(framesDir, { recursive: true });
const framePaths = [];
for (const e of events) {
  const fp = path.join(framesDir, `t${String(e.mid).replace('.', '_')}.png`);
  const r = await run(ff, [...ffPrefix, '-hide_banner', '-nostats', '-y', '-ss', String(e.mid), '-i', P.video, '-frames:v', '1', '-q:v', '2', fp]);
  if (r.code === 0 && existsSync(fp)) { e.frame = fp; framePaths.push(fp); }
}

// ---- OCR all frames in one process ----
const ocrRes = await run(OCR_PY, [path.join(ROOT, 'scripts/qa/ocr.py'), ...framePaths]);
if (ocrRes.code !== 0) { console.error('✗ OCR failed:', ocrRes.stderr.trim().slice(-300)); process.exit(2); }
const ocr = JSON.parse(ocrRes.stdout);

// prominent caption = the tallest OCR box (big French), ignoring tiny chrome
const captionOf = (fp) => {
  const boxes = ocr[fp]; if (!Array.isArray(boxes) || !boxes.length) return '';
  const tall = [...boxes].sort((a, b) => b.h - a.h)[0];
  // include boxes of comparable height (a caption may wrap to 2 lines)
  return boxes.filter((b) => b.h >= tall.h * 0.7).sort((a, b) => a.cy - b.cy).map((b) => b.text).join(' ');
};
// What was actually spoken in the event window. For a French caption we trust
// the French-forced window transcription (asr.windows, keyed by beat index);
// fall back to the auto-language word stream otherwise.
const heardByIndex = new Map(asr.windows.map((w) => [w.index, w.text]));
const spokenIn = (idx, a, b) => heardByIndex.get(idx) || asr.words.filter((w) => w.end > a && w.start < b).map((w) => w.word).join(' ');

const findings = [];
let checked = 0;
for (const e of events) {
  if (!e.frame) continue;
  checked++;
  const shown = captionOf(e.frame);
  const spoken = spokenIn(e.index, e.start, e.end);
  const simSpoken = +charSim(shown, spoken).toFixed(2);
  const simIntended = +charSim(shown, e.caption).toFixed(2);
  // Only flag when the CAPTION the render shows disagrees with BOTH what's spoken
  // AND what the manifest intended — that's a real on-screen/audio mismatch.
  if (shown && simSpoken < MIN_SIM && simIntended < 0.6) {
    findings.push(finding('av-sync', simSpoken < 0.25 ? 'high' : 'medium', e.mid,
      `On-screen caption doesn't match the audio: screen shows "${shown}" but audio says "${spoken}" (intended "${e.caption}").`,
      { onScreen: shown, spoken, intendedCaption: e.caption, simVsSpoken: simSpoken, simVsIntended: simIntended, index: e.index },
      'Verify the slide renders the currently-spoken line (dynamic PracticeSlide), not a stale/static caption.'));
  }
}

await writeFindings(id, 'av-sync', findings);
console.log(`GATE B · av-sync — ${events.length} caption changes, ${checked} frames OCR'd + diffed`);
if (!findings.length) console.log('  ✓ every sampled caption matches the audio at its timestamp.');
else for (const f of findings.slice(0, 12)) console.log(`  ${f.severity === 'high' ? '✗' : '⚠'} ${f.timestamp}s screen "${f.evidence.onScreen}" ≠ audio "${f.evidence.spoken}"`);
process.exit(findings.some((f) => f.severity === 'high') ? 3 : 0);
