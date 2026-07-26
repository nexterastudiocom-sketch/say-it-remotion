#!/usr/bin/env node
// GATE B · pronunciation  (post-render, deterministic)
//
//   node scripts/qa/gate-b-pronunciation.mjs <video-id>
//
// French ASR round-trip: each intended French line's window is re-transcribed
// from the RENDERED audio (forcing French), then diffed against the intended
// text. Low-similarity lines are flagged as mispronunciation / wrong-audio
// candidates. Deterministic similarity — no LLM judgment.

import { existsSync } from 'node:fs';
import { paths, readJson, similarity, normFr, levenshtein } from './lib.mjs';
import { ensureAsr } from './asr.mjs';
import { rules, merge } from './gateb.mjs';

// Pronunciation is the ASR "lever", not a numbered rule — emit under PRON so it
// lands in qa/<id>.json without clobbering the engine doc, and never blocks.
const Y = await rules();
const pron = (severity, timestamp, issue, evidence) => ({ gate: 'B', rule: 'PRON', severity, layer: 'L2', line: 0, issue: `[${timestamp}s] ${issue}`, evidence, suggested_fix: 'Listen to the clip; regenerate only if genuinely wrong (many flags are whisper mishearing short/slow clips).' });

// Char-level (despaced) similarity — robust to deliberate slow syllable breaks
// ("Au... re... voir" == "Au revoir"). The line score is the better of the two.
const despace = (s) => normFr(s).replace(/\s/g, '');
function charSim(a, b) {
  const ca = despace(a).split(''), cb = despace(b).split('');
  if (!ca.length && !cb.length) return 1;
  if (!ca.length || !cb.length) return 0;
  return Math.max(0, 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length));
}
const lineSim = (a, b) => Math.max(similarity(a, b), charSim(a, b));

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run: node scripts/qa/manifest.mjs ${id}`); process.exit(2); }

const MIN_SIM = 0.6;       // below this = flagged
const MAX_LOW_FRACTION = 0.15; // allow a few (whisper mishears slow syllable clips)

const manifest = await readJson(P.manifest);
const asr = await ensureAsr(id);
const heardByIndex = new Map(asr.windows.map((w) => [w.index, w.text]));

const frLines = manifest.lines.filter((r) => r.kind === 'french' && r.intendedFrench);
const scored = [];
const findings = [];
for (const r of frLines) {
  const heard = heardByIndex.get(r.index) || '';
  const sim = +lineSim(r.intendedFrench, heard).toFixed(2);
  scored.push(sim);
  if (sim < MIN_SIM) {
    // ASR round-trip yields CANDIDATES, not verdicts (whisper mis-hears short
    // clips) — so each line is 'medium'. A systemic pattern escalates below.
    findings.push(pron('WARN', r.videoStart,
      `Mispronunciation candidate: intended "${r.intendedFrench}" but heard "${heard}" (sim ${sim}).`,
      `line ${r.sourceLine} · ${r.audioAsset || ''}`));
  }
}
const avg = scored.length ? +(scored.reduce((a, s) => a + s, 0) / scored.length).toFixed(2) : 0;
const lowFrac = scored.length ? findings.length / scored.length : 0;

// Systemic = the whole track is off (bad take everywhere / wrong language / mux
// problem), which is high-severity. A handful of candidates is not.
const systemic = lowFrac > MAX_LOW_FRACTION || avg < MIN_SIM;
if (systemic) findings.push(pron('WARN', frLines[0]?.videoStart ?? 0,
  `Systemic: avg similarity ${avg}, ${Math.round(lowFrac * 100)}% of French lines below ${MIN_SIM} — check voice/model/mux.`, 'systemic'));

await merge(id, ['PRON'], findings, { pronunciation: { lines: frLines.length, avg, low: findings.length } });
console.log(`GATE B · pronunciation — ${frLines.length} French lines, avg similarity ${avg}, ${findings.filter((f) => f.evidence !== 'systemic').length} candidates (${Math.round(lowFrac * 100)}%)`);
if (!findings.length) console.log('  ✓ every French line matches its script.');
else { for (const f of findings.slice(0, 12)) console.log(`  ⚠ ${f.issue}`);
  if (findings.length > 12) console.log(`  … ${findings.length - 12} more`);
  console.log(systemic ? `  ⚠ SYSTEMIC: ${Math.round(lowFrac * 100)}% mismatched (> ${Math.round(MAX_LOW_FRACTION * 100)}% or avg < ${MIN_SIM}).` : `  (within tolerance — likely slow syllable-break clips, not a systemic problem.)`); }
process.exit(0); // pronunciation is a WARN-level lever, never blocks
