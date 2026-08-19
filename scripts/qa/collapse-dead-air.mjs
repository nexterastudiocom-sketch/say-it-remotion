#!/usr/bin/env node
// Collapse INTERIOR dead air inside already-synthesized French clips — the T-07
// block — without paying for a re-bake.
//
//   node scripts/qa/collapse-dead-air.mjs <id> [--apply]
//
// Why this exists: eleven_v3 reads a mid-line sentence break as a dramatic pause.
// On "Bonjour, madame. Quatre." it inserted 1.24s of silence after "madame." and
// re-synthesizing reproduced it (1.39s) — it is deterministic, not a bad roll, so
// re-rolling the clip cannot fix it.
//
// trimSilence() in lib/eleven.mjs only strips the leading/trailing edges (two
// silenceremove passes around an areverse), so an interior hole survives by design.
// This pass keeps `KEEP` seconds of any silence longer than GAP and drops the rest.
// It removes only samples under the threshold — it never time-stretches, which is
// the transform human QA heard as mispronunciation on glides and nasals (see the
// v5 commits). Speech samples are untouched.
import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FF = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg');
const id = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!id) { console.error('usage: collapse-dead-air.mjs <id> [--apply]'); process.exit(2); }

// Same detector the gate uses (gate-b-technical.mjs) so this fixes exactly what
// T-07 reports — no more, no less.
const GAP = 1.0, EDGE = 0.15, TH = '-40dB';
const KEEP = 0.3;   // silence left in place: a natural sentence break, well under GAP

const man = JSON.parse(readFileSync(path.join(ROOT, 'build', id, 'manifest.json'), 'utf8'));
const seen = new Set();
let scanned = 0, fixed = 0;

for (const r of man.lines) {
  if (r.kind !== 'french' || !r.audioAsset || !(r.durationSeconds <= 4.5)) continue;
  if (/\.\.\.|…/.test(r.spokenText || '')) continue;
  if (seen.has(r.audioAsset)) continue;
  seen.add(r.audioAsset);
  const abs = path.join(ROOT, 'public', r.audioAsset);
  if (!existsSync(abs)) continue;
  scanned++;

  const probe = (f) => {
    // ffmpeg exits 0 on a successful scan, so stderr must be read unconditionally.
    const pr = spawnSync(FF, ['-hide_banner', '-nostats', '-i', f, '-af',
      `silencedetect=noise=${TH}:d=0.3`, '-f', 'null', '-'], { encoding: 'utf8' });
    const err = String(pr.stderr || '');
    const dm = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const len = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3]) : 0;
    const iv = []; let st = null;
    for (const mm of err.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
      if (mm[1] === 'start') st = Number(mm[2]);
      else if (st != null) { iv.push([st, Number(mm[2])]); st = null; }
    }
    return { len, holes: iv.filter(([a, b]) => b - a > GAP && b > EDGE && !(len && a >= len - EDGE)) };
  };

  const before = probe(abs);
  if (!before.holes.length) continue;

  const [a, b] = before.holes[0];
  console.log(`  ${(b - a).toFixed(2)}s hole at ${a.toFixed(2)}s — "${(r.spokenText || '').slice(0, 40)}"`);
  if (!APPLY) { fixed++; continue; }

  const tmp = abs.replace(/\.mp3$/i, '.gap.mp3');
  try {
    execFileSync(FF, ['-y', '-hide_banner', '-nostats', '-i', abs, '-af',
      `silenceremove=stop_periods=-1:stop_duration=${KEEP}:stop_threshold=${TH}:detection=peak`,
      tmp], { stdio: 'pipe' });
    await writeFile(abs, await readFile(tmp));
  } catch (e) {
    console.error(`  ✗ ffmpeg failed, clip left untouched: ${String(e.message).split('\n')[0]}`);
    await rm(tmp, { force: true });
    continue;
  }
  await rm(tmp, { force: true });

  const after = probe(abs);
  console.log(`    → ${before.len.toFixed(2)}s becomes ${after.len.toFixed(2)}s, holes ${before.holes.length} → ${after.holes.length}`);
  fixed++;
}

console.log(`${APPLY ? 'repaired' : 'would repair'} ${fixed} of ${scanned} atomic French clip(s) in ${id}`);
if (APPLY && fixed) console.log('Re-run build-method-lesson + manifest so the timeline picks up the new durations.');
