#!/usr/bin/env node
// GATE B · P-07  (L2)  — measured silence vs declared pause, standalone
//
//   node scripts/qa/gate-b-pause.mjs <video-id>
//
// silencedetect on the render → for every declared PAUSE beat in the manifest,
// compare the measured silence in its window against the declared duration.
// |measured − declared| > 0.4s → WARN (TTS overrun / renderer rounding).

import { existsSync } from 'node:fs';
import { paths, readJson, run, REMOTION, ffmpegStatic } from './lib.mjs';
import { rules, finding, merge } from './gateb.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.video)) { console.error(`✗ no render: ${P.video}`); process.exit(2); }
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run scripts/qa/manifest.mjs ${id}`); process.exit(2); }
const Y = await rules();
const TOL = (Y._byId['P-07']?.params?.tolerance_s) ?? 0.4;
const man = await readJson(P.manifest);

const ff = ffmpegStatic() || REMOTION;
const ffPre = ff === REMOTION ? ['ffmpeg'] : [];
const sd = await run(ff, [...ffPre, '-hide_banner', '-nostats', '-i', P.video, '-af', 'silencedetect=noise=-40dB:d=0.3', '-f', 'null', '-']);
const sil = [];
let cur = null;
for (const m of sd.stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
  if (m[1] === 'start') cur = { start: +m[2] };
  else if (cur) { cur.end = +m[2]; sil.push(cur); cur = null; }
}
const silenceIn = (a, b) => sil.reduce((s, iv) => s + Math.max(0, Math.min(b, iv.end) - Math.max(a, iv.start)), 0);

const F = [];
let checked = 0, maxDelta = 0;
for (const r of man.lines) {
  if (r.kind !== 'pause' || r.durationSeconds < 0.5) continue; // ignore sub-0.5s settle gaps
  checked++;
  const measured = +silenceIn(r.videoStart - 0.1, r.videoEnd + 0.1).toFixed(2);
  const delta = +(measured - r.durationSeconds).toFixed(2);
  maxDelta = Math.max(maxDelta, Math.abs(delta));
  if (Math.abs(delta) > TOL)
    F.push(finding(Y, 'P-07', r.sourceLine || 0,
      `measured silence ${measured}s vs declared ${r.durationSeconds}s (Δ${delta > 0 ? '+' : ''}${delta}s, tol ${TOL}s) at ${r.videoStart}s`, ''));
}

await merge(id, ['P-07'], F, { pause_check: { declared_pauses: checked, max_delta_s: +maxDelta.toFixed(2) } });
console.log(`GATE B · P-07 — ${checked} declared pauses, ${sil.length} measured silences, max Δ ${maxDelta.toFixed(2)}s (tol ${TOL}s)`);
if (!F.length) console.log('  ✓ every declared pause matches the render within tolerance.');
else for (const f of F.slice(0, 12)) console.log(`  ⚠ ${f.issue}`);
process.exit(0); // P-07 is WARN
