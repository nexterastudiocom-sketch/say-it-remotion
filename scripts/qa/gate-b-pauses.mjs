#!/usr/bin/env node
// GATE B · pauses  (post-render, deterministic)
//
//   node scripts/qa/gate-b-pauses.mjs <video-id>
//
// Runs ffmpeg silencedetect on the RENDERED audio to get an actual pause table,
// then checks every "repeat-after-me" gap (an ECHO/repeat prompt → silence where
// the learner speaks): the real silence must be ≥ 1.2× the phrase's duration, or
// the learner is rushed. Writes findings to qa/<id>.json.

import { existsSync } from 'node:fs';
import { paths, readJson, writeFindings, finding, run, ffmpegStatic, REMOTION } from './lib.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run: node scripts/qa/manifest.mjs ${id}`); process.exit(2); }
if (!existsSync(P.video)) { console.error(`✗ no render: ${P.video}`); process.exit(2); }
const manifest = await readJson(P.manifest);
const RATIO = 1.2; // required gap ÷ phrase duration

// ---- actual silence table from the rendered audio ----
const ff = ffmpegStatic() || REMOTION;
const args = ff === REMOTION ? ['ffmpeg'] : [];
const r = await run(ff, [...args, '-hide_banner', '-nostats', '-i', P.video, '-af', 'silencedetect=noise=-35dB:d=0.4', '-f', 'null', '-']);
const sil = [];
let cur = null;
for (const m of r.stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)(?:\s*\|\s*silence_duration:\s*([\d.]+))?/g)) {
  if (m[1] === 'start') cur = { start: +m[2] };
  else if (cur) { cur.end = +m[2]; cur.dur = m[3] ? +m[3] : +(cur.end - cur.start).toFixed(2); sil.push(cur); cur = null; }
}
// actual silence overlapping a window [a,b]
const silenceIn = (a, b) => sil.reduce((s, iv) => s + Math.max(0, Math.min(b, iv.end) - Math.max(a, iv.start)), 0);

// ---- find repeat-after-me events in the manifest: an ECHO pause preceded by a
// repeat prompt; the "phrase" is the nearest French clip the learner echoes. ----
const lines = manifest.lines;
// A real repeat-after-me prompt — NOT narrative "one more scene". ECHO-phase
// pauses are caught separately by phase, which covers short cues like "One more."
const isRepeatPrompt = (t) => /\brepeat\b/i.test(t || '') || /^(one more time|once more|again)\b/i.test((t || '').trim());
const findings = [];
let checked = 0;

for (let i = 0; i < lines.length; i++) {
  const b = lines[i];
  if (b.kind !== 'pause') continue;
  const prev = lines[i - 1];
  const echo = b.phase === 'ECHO' || (prev && prev.kind === 'english' && isRepeatPrompt(prev.spokenText));
  if (!echo) continue;
  // phrase = nearest French clip (prefer the confirmation right after the pause, else before)
  let phrase = null;
  for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) if (lines[j].kind === 'french') { phrase = lines[j]; break; }
  if (!phrase) for (let j = i - 1; j >= Math.max(0, i - 4); j--) if (lines[j].kind === 'french') { phrase = lines[j]; break; }
  if (!phrase) continue;
  checked++;
  const required = +(RATIO * phrase.durationSeconds).toFixed(2);
  const actual = +silenceIn(b.videoStart - 0.2, b.videoEnd + 0.2).toFixed(2);
  if (actual < required) {
    findings.push(finding('pauses', actual < 0.6 * required ? 'high' : 'medium', b.videoStart,
      `Repeat-after-me gap is too short: ${actual}s of silence for a phrase that runs ${phrase.durationSeconds}s (need ≥ ${required}s = ${RATIO}×).`,
      { phrase: phrase.intendedFrench, phraseSeconds: phrase.durationSeconds, requiredGap: required, actualSilence: actual, plannedGap: b.durationSeconds, sourceLine: phrase.sourceLine },
      `Increase the PAUSE after this repeat prompt to ≥ ${required}s in curriculum/${id}.sent.md.`));
  }
}

await writeFindings(id, 'pauses', findings);
console.log(`GATE B · pauses — ${sil.length} silences detected, ${checked} repeat gaps checked`);
if (!findings.length) console.log('  ✓ every repeat-after-me gap is ≥ 1.2× its phrase.');
else for (const f of findings) console.log(`  ${f.severity === 'high' ? '✗' : '⚠'} [${f.severity}] ${f.timestamp}s "${f.evidence.phrase}" — ${f.evidence.actualSilence}s < ${f.evidence.requiredGap}s`);
process.exit(findings.some((f) => f.severity === 'high') ? 3 : 0);
