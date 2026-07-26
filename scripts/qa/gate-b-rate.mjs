#!/usr/bin/env node
// GATE B · R-06 (L2) — measured syllables/sec vs declared rate band. Standalone.
//   node scripts/qa/gate-b-rate.mjs <video-id>
// Whisper word timestamps (build/<id>/asr.json) → syllables/sec per FR beat →
// compare to the band for that beat's [rate:] tag. Needs the conformant lesson's
// rate tags in the manifest; beats without a rateTag are skipped.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, ROOT } from './lib.mjs';
import { rules, finding, merge } from './gateb.mjs';

const FR_VOWELS = new Set('aeiouyàâäéèêëîïôöùûüÿœæ');
function frSyllables(text) {
  let t = (text || '').toLowerCase().replace(/[^a-zà-öø-ÿ'’\s]/g, ' ').replace(/['’]/g, ' ');
  let total = 0;
  for (const w of t.split(/\s+/).filter(Boolean)) {
    let g = 0, prev = false;
    for (const ch of w) { const v = FR_VOWELS.has(ch); if (v && !prev) g++; prev = v; }
    if (g > 1) { if (w.endsWith('es') && !FR_VOWELS.has(w[w.length - 3])) g--; else if (w.endsWith('e') && !FR_VOWELS.has(w[w.length - 2])) g--; }
    total += Math.max(1, g);
  }
  return Math.max(1, total);
}

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest`); process.exit(2); }
const asrPath = path.join(ROOT, `build/${id}/asr.json`);
if (!existsSync(asrPath)) { console.error(`✗ no build/${id}/asr.json — run scripts/qa/asr.mjs first`); process.exit(2); }
const Y = await rules();
const bands = Y._byId['R-06']?.params?.bands || {};
const man = await readJson(P.manifest);
const asr = await readJson(asrPath);

const F = [];
let checked = 0;
for (const r of man.lines) {
  if (r.kind !== 'french' || !r.rateTag || !bands[r.rateTag]) continue;
  const words = (asr.words || []).filter((w) => w.start >= r.videoStart - 0.2 && w.end <= r.videoEnd + 0.2);
  if (!words.length) continue;
  const span = Math.max(0.2, words[words.length - 1].end - words[0].start);
  const syl = frSyllables(r.intendedFrench);
  const sps = +(syl / span).toFixed(2);
  checked++;
  const [lo, hi] = bands[r.rateTag];
  if (sps < lo || sps > hi)
    F.push(finding(Y, 'R-06', r.sourceLine || 0,
      `${sps} syl/s for a [rate: ${r.rateTag}] line "${r.intendedFrench}" (band ${lo}–${hi}) at ${r.videoStart}s`, ''));
}
await merge(id, ['R-06'], F, { rate_check: { measured: checked } });
console.log(`GATE B · R-06 — ${checked} rated FR lines measured`);
if (!checked) console.log('  (no [rate:] tags in manifest — needs a Method-grammar lesson)');
else if (!F.length) console.log('  ✓ every rated line is within its band.');
else for (const f of F.slice(0, 12)) console.log(`  ⚠ ${f.issue}`);
process.exit(0);
