#!/usr/bin/env node
// Run the whole QA suite for a video and print a severity summary.
// Convenience only — every check below is ALSO a standalone script you can run alone.
//
//   node scripts/qa/all.mjs <video-id> [--gate-a-only] [--gate-b-only]
//   SAYIT_QA_VIDEO=out/films/<id>-preview.mp4 node scripts/qa/all.mjs <id>   # test vs a preview
//
// Exit 3 if any HIGH finding exists (so CI / the loop can block).

import { existsSync } from 'node:fs';
import { paths, readJson, run, ROOT } from './lib.mjs';

const id = process.argv[2] || 'lesson-01';
const only = process.argv.includes('--gate-a-only') ? 'a' : process.argv.includes('--gate-b-only') ? 'b' : 'all';
const node = (script, ...args) => run('node', [`scripts/qa/${script}`, id, ...args]);

const steps = [];
if (only !== 'b') steps.push(['manifest.mjs'], ['gate-a-curriculum.mjs']);
if (only !== 'a') steps.push(['gate-b-pauses.mjs'], ['gate-b-wpm.mjs'], ['gate-b-pronunciation.mjs'], ['gate-b-av-sync.mjs']);

console.log(`\n══ QA suite · ${id}${process.env.SAYIT_QA_VIDEO ? ` (video: ${process.env.SAYIT_QA_VIDEO})` : ''} ══\n`);
for (const [script, ...args] of steps) {
  const r = await node(script, ...args);
  process.stdout.write(r.stdout);
  if (r.code === 2) { process.stdout.write(`  (skipped: ${r.stderr.trim().split('\n').pop()})\n`); }
  else if (r.stderr.trim()) process.stderr.write(r.stderr);
  console.log('');
}

// summary from qa/<id>.json
const P = paths(id);
const findings = existsSync(P.qa) ? await readJson(P.qa) : [];
const by = (s) => findings.filter((f) => f.severity === s).length;
const byGate = {};
for (const f of findings) byGate[f.gate] = (byGate[f.gate] || 0) + 1;
console.log('── summary ──');
console.log(`  findings: ${findings.length}  (high ${by('high')}, medium ${by('medium')}, low ${by('low')})`);
console.log(`  by gate: ${Object.entries(byGate).map(([g, n]) => `${g}:${n}`).join('  ') || '(none)'}`);
console.log(`  report: qa/${id}.json`);
process.exit(by('high') ? 3 : 0);
