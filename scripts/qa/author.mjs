#!/usr/bin/env node
// Self-repair authoring loop (Command 3). After a transcript is (re)written, run
// Gate A, print every BLOCK with its suggested_fix so the authoring agent can
// repair, and STOP on WARN (a human decides — never auto-signed-off).
//   node scripts/qa/author.mjs <video-id>
// Exit 1 while BLOCKs remain (agent fixes + re-runs, ≤5 iterations), 0 when clean.
import { existsSync } from 'node:fs';
import { paths, readJson, run } from './lib.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
const r = await run('node', ['scripts/qa/gate-a.mjs', id]);
process.stdout.write(r.stdout);
if (r.status === 2 || r.code === 2) { console.error('\n✗ no Method-grammar transcript — author lessons/' + id + '.md first.'); process.exit(2); }
const doc = existsSync(P.qa) ? await readJson(P.qa) : { findings: [] };
const A = (doc.findings || []).filter((f) => f.gate === 'A');
const block = A.filter((f) => f.severity === 'BLOCK');
const warn = A.filter((f) => f.severity === 'WARN');
console.log(`\n── self-repair · ${id} ──`);
if (block.length) {
  console.log(`  ${block.length} BLOCK to fix (edit lessons/${id}.md, then re-run):`);
  for (const f of block) console.log(`   ✗ ${f.rule}${f.line ? ' L' + f.line : ''}: ${f.issue}\n       → ${f.suggested_fix}`);
  console.log('\n  Fix these and re-run. Do not render until 0 BLOCK. (loop cap: 5 iterations)');
  process.exit(1);
}
console.log('  ✓ 0 BLOCK — Gate A passes.');
if (warn.length) { console.log(`\n  ${warn.length} WARN — a human decides (not auto-signed-off):`); for (const f of warn) console.log(`   ⚠ ${f.rule}${f.line ? ' L' + f.line : ''}: ${f.issue}`); }
process.exit(0);
