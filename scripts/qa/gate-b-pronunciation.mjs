#!/usr/bin/env node
// GATE B · pronunciation  (post-render, deterministic)
//
//   node scripts/qa/gate-b-pronunciation.mjs <video-id>
//
// French ASR round-trip. CRITICAL: the delivered French is deliberately SLOWED
// (0.7–0.95× real) for comprehension, and whisper transcribes half-speed speech
// badly (it scored ~0.12 similarity on everything). So each clip is first sped
// back to normal by its own rate, THEN transcribed and diffed against the script.
// Deterministic — no LLM judgment; WARN-level, never blocks.

import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { paths, readJson, similarity, normFr, levenshtein, ROOT } from './lib.mjs';
import { rules, merge } from './gateb.mjs';

const require = createRequire(import.meta.url);
const FF = require('ffmpeg-static');
const PY = path.join(ROOT, '.venv-whisper/bin/python');

// The baker slows French by these fractions of real speed; un-slow = 1/fraction.
const RATE_ATEMPO = { very_slow: 0.7, slow: 0.75, natural: 0.85, fast: 0.95 };

const Y = await rules();
const pron = (severity, timestamp, issue, evidence) => ({ gate: 'B', rule: 'PRON', severity, layer: 'L2', line: 0, issue: `[${timestamp}s] ${issue}`, evidence, suggested_fix: 'Listen to the clip; regenerate only if genuinely wrong.' });

// ASR writes spoken numbers as DIGITS ("4, 9, 17") while the script writes them as
// WORDS ("Quatre, neuf, dix-sept !"), which scores 0 similarity on every line of a
// numbers lesson — L03 came back 83% flagged with correct audio. Canonicalise both
// sides to digits before comparing. French 0-99 sums its parts (dix-sept = 10+7,
// soixante-dix-sept = 60+10+7), the one exception being quatre-vingt = 4x20.
const NUM = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, cent: 100, cents: 100 };
function numCanon(s) {
  // Split on punctuation FIRST: it is what separates a LIST of numbers from a
  // COMPOUND one. normFr flattens commas to spaces, so accumulating after it turns
  // "Quatre, neuf, dix-sept !" into 4+9+10+7 = 30 instead of "4 9 17". Hyphens and
  // spaces stay inside a segment, since those join compounds (dix-sept, vingt et un).
  return String(s || '').split(/[,.;:!?]+/).map((seg) => {
    const w = normFr(seg).split(' ').filter(Boolean);
    const out = [];
    for (let i = 0; i < w.length;) {
      if (!(w[i] in NUM)) { out.push(w[i]); i++; continue; }
      let sum = 0;
      while (i < w.length && (w[i] in NUM || w[i] === 'et')) {
        if (w[i] === 'et') { i++; continue; }                     // "vingt et un"
        if (w[i] === 'quatre' && (w[i + 1] === 'vingt' || w[i + 1] === 'vingts')) { sum += 80; i += 2; continue; }
        sum += NUM[w[i]]; i++;
      }
      out.push(String(sum));
    }
    return out.join(' ');
  }).filter(Boolean).join(' ');
}
const despace = (s) => normFr(numCanon(s)).replace(/\s/g, '');
function charSim(a, b) {
  const ca = despace(a).split(''), cb = despace(b).split('');
  if (!ca.length && !cb.length) return 1;
  if (!ca.length || !cb.length) return 0;
  return Math.max(0, 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length));
}
const lineSim = (a, b) => Math.max(similarity(numCanon(a), numCanon(b)), charSim(a, b));

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run: node scripts/qa/manifest.mjs ${id}`); process.exit(2); }

const MIN_SIM = 0.6;
const MAX_LOW_FRACTION = 0.15;

const manifest = await readJson(P.manifest);
const frLines = manifest.lines.filter((r) => r.kind === 'french' && r.intendedFrench && r.audioAsset);

// 1) Un-slow each French clip to normal speed into a temp dir, keyed by index.
const tmp = path.join(ROOT, `build/${id}/pron-normal`);
rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
for (const r of frLines) {
  const src = path.join(ROOT, 'public', r.audioAsset);
  if (!existsSync(src)) continue;
  const up = 1 / (RATE_ATEMPO[r.rateTag] ?? 0.85);          // e.g. natural 0.85 → 1.18× faster
  const chain = up <= 2 ? `atempo=${up.toFixed(4)}` : `atempo=2.0,atempo=${(up / 2).toFixed(4)}`;
  spawnSync(FF, ['-y', '-hide_banner', '-nostats', '-i', src, '-af', chain, '-ar', '16000', '-ac', '1', path.join(tmp, `${r.index}.wav`)], { stdio: 'ignore' });
}

// 2) Transcribe them all in one whisper load.
let heardByIndex = new Map();
if (readdirSync(tmp).length) {
  const r = spawnSync(PY, [path.join(ROOT, 'scripts/qa/stt_batch.py'), tmp, 'fr'], { encoding: 'utf8' });
  try { const o = JSON.parse(r.stdout || '{}'); for (const [f, t] of Object.entries(o)) heardByIndex.set(Number(f.replace('.wav', '')), t); } catch { /* leave empty */ }
}
rmSync(tmp, { recursive: true, force: true });

// 3) Score.
const scored = [], findings = [];
for (const r of frLines) {
  const heard = heardByIndex.get(r.index) || '';
  const sim = +lineSim(r.intendedFrench, heard).toFixed(2);
  scored.push(sim);
  if (sim < MIN_SIM) findings.push(pron('WARN', r.videoStart,
    `Mispronunciation candidate: intended "${r.intendedFrench}" but heard "${heard}" (sim ${sim}).`,
    `line ${r.sourceLine} · ${r.audioAsset}`));
}
const avg = scored.length ? +(scored.reduce((a, s) => a + s, 0) / scored.length).toFixed(2) : 0;
const lowFrac = scored.length ? findings.length / scored.length : 0;
const systemic = lowFrac > MAX_LOW_FRACTION || avg < MIN_SIM;
if (systemic) findings.push(pron('WARN', frLines[0]?.videoStart ?? 0,
  `Systemic: avg similarity ${avg}, ${Math.round(lowFrac * 100)}% of French lines below ${MIN_SIM} — check voice/model/mux.`, 'systemic'));

await merge(id, ['PRON'], findings, { pronunciation: { lines: frLines.length, avg, low: findings.length } });
console.log(`GATE B · pronunciation — ${frLines.length} French lines, avg similarity ${avg}, ${findings.filter((f) => f.evidence !== 'systemic').length} candidates (${Math.round(lowFrac * 100)}%)`);
if (!findings.length) console.log('  ✓ every French line matches its script.');
else { for (const f of findings.slice(0, 8)) console.log(`  ⚠ ${f.issue}`);
  console.log(systemic ? `  ⚠ SYSTEMIC: ${Math.round(lowFrac * 100)}% mismatched.` : '  (within tolerance.)'); }
process.exit(0);
