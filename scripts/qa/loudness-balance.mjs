#!/usr/bin/env node
// GATE — per-SPEAKER loudness balance. The whole-video −14 LUFS pass only fixes
// the mix AVERAGE; it can't catch one voice being consistently quieter (FR·MAN
// was −26 vs EN·WOMAN −14.6). This measures each speaker's clips and FAILS if the
// spread between the loudest and quietest voice exceeds the tolerance — so the
// per-clip loudnorm can never silently regress.
//   node scripts/qa/loudness-balance.mjs <id> [--max 3] [--sample 8]
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FF = require('ffmpeg-static');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) || 'lesson-01';
const MAX = Number(args[args.indexOf('--max') + 1]) || 3.0;      // max LUFS spread between speakers
const SAMPLE = Number(args[args.indexOf('--sample') + 1]) || 8;  // clips measured per speaker

const lesson = JSON.parse(await readFile(path.join(ROOT, `src/data/lessons/${id}.method.json`), 'utf8'));
const byVoice = {};
for (const s of lesson.slides) for (const b of s.beats || []) {
  if (b.voice && b.src) (byVoice[b.voice] ??= []).push(b.src);
}

const lufs = (rel) => {
  const abs = path.join(ROOT, 'public', rel);
  if (!existsSync(abs)) return null;
  // ebur128 prints its summary to STDERR, so read both streams.
  const r = spawnSync(FF, ['-hide_banner', '-i', abs, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  const m = [...out.matchAll(/I:\s*(-?[0-9.]+) LUFS/g)];
  return m.length ? Number(m[m.length - 1][1]) : null;
};

const means = {};
for (const [voice, srcs] of Object.entries(byVoice)) {
  const uniq = [...new Set(srcs)].slice(0, SAMPLE);
  const vals = uniq.map(lufs).filter((v) => v != null && isFinite(v));
  if (vals.length) means[voice] = vals.reduce((a, v) => a + v, 0) / vals.length;
}
const entries = Object.entries(means);
const vals = entries.map(([, v]) => v);
const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;

console.log(`GATE · loudness balance — ${id}`);
for (const [v, m] of entries.sort((a, b) => a[1] - b[1])) console.log(`  ${v.padEnd(9)} ${m.toFixed(1)} LUFS`);
console.log(`  spread ${spread.toFixed(1)} LUFS (max ${MAX})`);
if (spread > MAX) {
  console.error(`  ✗ speakers differ by ${spread.toFixed(1)} LUFS (> ${MAX}) — per-clip loudnorm broken?`);
  process.exit(1);
}
console.log('  ✓ speakers within tolerance.');
