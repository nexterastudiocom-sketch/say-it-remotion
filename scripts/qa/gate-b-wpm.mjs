#!/usr/bin/env node
// GATE B · wpm  (post-render, deterministic)
//
//   node scripts/qa/gate-b-wpm.mjs <video-id>
//
// Uses whisper word-level timestamps (build/<id>/asr.json) to measure words-per-
// minute of the SPOKEN audio per segment, and flags segments that are too fast
// or too slow for a beginner lesson. Speaking-time only (silences excluded).

import { existsSync } from 'node:fs';
import { paths, readJson, writeFindings, finding } from './lib.mjs';
import { ensureAsr } from './asr.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run: node scripts/qa/manifest.mjs ${id}`); process.exit(2); }

// Beginner-lesson pacing band (words per minute of actual speech).
const MIN_WPM = 60, MAX_WPM = 190, MIN_WORDS = 6; // ignore tiny segments

const manifest = await readJson(P.manifest);
const asr = await ensureAsr(id);

// Group manifest lines by segment; take each segment's spoken window.
const bySeg = new Map();
for (const r of manifest.lines) {
  const key = r.segment || r.slideId;
  if (!bySeg.has(key)) bySeg.set(key, { segment: key, start: Infinity, end: -Infinity, spokenSeconds: 0 });
  const g = bySeg.get(key);
  if (r.kind !== 'pause') { g.start = Math.min(g.start, r.videoStart); g.end = Math.max(g.end, r.videoEnd); g.spokenSeconds += r.durationSeconds; }
}

const findings = [];
const rows = [];
for (const g of bySeg.values()) {
  if (!isFinite(g.start)) continue;
  const words = asr.words.filter((w) => w.start >= g.start - 0.3 && w.end <= g.end + 0.3);
  if (words.length < MIN_WORDS || g.spokenSeconds < 2) continue;
  const wpm = Math.round((words.length / g.spokenSeconds) * 60);
  rows.push({ segment: g.segment, wpm, words: words.length, spoken: +g.spokenSeconds.toFixed(1) });
  if (wpm > MAX_WPM || wpm < MIN_WPM) {
    findings.push(finding('wpm', wpm > MAX_WPM * 1.15 || wpm < MIN_WPM * 0.7 ? 'high' : 'medium', g.start,
      `Speaking pace ${wpm} wpm in "${g.segment}" is ${wpm > MAX_WPM ? 'too fast' : 'too slow'} (target ${MIN_WPM}–${MAX_WPM} wpm).`,
      { segment: g.segment, wpm, words: words.length, spokenSeconds: +g.spokenSeconds.toFixed(1) },
      wpm > MAX_WPM ? 'Slow the narration or split the segment.' : 'Tighten dead air inside clips, or this may be measurement noise on a very short segment.'));
  }
}

await writeFindings(id, 'wpm', findings);
const med = rows.length ? Math.round(rows.reduce((a, r) => a + r.wpm, 0) / rows.length) : 0;
console.log(`GATE B · wpm — ${rows.length} segments measured, median ${med} wpm (band ${MIN_WPM}–${MAX_WPM})`);
if (!findings.length) console.log('  ✓ all measured segments within the pacing band.');
else for (const f of findings) console.log(`  ${f.severity === 'high' ? '✗' : '⚠'} [${f.severity}] ${f.evidence.wpm} wpm — ${f.evidence.segment}`);
process.exit(findings.some((f) => f.severity === 'high') ? 3 : 0);
