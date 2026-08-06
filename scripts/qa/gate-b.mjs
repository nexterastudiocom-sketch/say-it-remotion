#!/usr/bin/env node
// GATE B runner — the 14 post-render rules + the ASR pronunciation lever + the
// I-07 vision rubric. Each is ALSO a standalone script; this just chains them
// and prints a BLOCK/WARN summary from qa/<id>.json. Exit 1 on any Gate-B BLOCK.
//   node scripts/qa/gate-b.mjs <video-id>
//   MOSAIC_QA_VIDEO=out/films/<id>-preview.mp4 node scripts/qa/gate-b.mjs <id>
import { existsSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, run, ROOT } from './lib.mjs';
import { ensureAsr } from './asr.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
console.log(`\n══ GATE B · ${id}${process.env.MOSAIC_QA_VIDEO ? ` (${process.env.MOSAIC_QA_VIDEO})` : ''} ══\n`);
if (existsSync(P.video) && existsSync(P.manifest)) { try { await ensureAsr(id); } catch (e) { console.log('  (asr unavailable:', e.message.slice(0, 80) + ')'); } }
// I-07 vision rubric via the reference engine (the ONE model check)
const tPaths = [`lessons/${id}.md`, `curriculum/${id}.md`, `lessons/golden/${id.replace('-', '_')}.md`].map((r) => path.join(ROOT, r)).filter(existsSync);
if (tPaths[0]) { await run(path.join(ROOT, '.venv-ocr/bin/python'), [path.join(ROOT, 'qa/mosaic_qc.py'), tPaths[0], '--rules', path.join(ROOT, 'qa/mosaic_rules.yaml'), '--emit-vision-rubric', path.join(ROOT, `build/${id}/vision-rubric.json`)]); console.log('  I-07 · vision rubric → build/' + id + '/vision-rubric.json (needs a vision pass)\n'); }

// Sub-check exit convention: 0 = ran clean, 1 = ran and found BLOCKs, 2 = skipped
// (precondition missing). A CRASH also exits non-zero but writes nothing to stdout —
// that used to be indistinguishable from "ran and blocked", so gate-b-i05 could die
// on an unparseable lexicon and the summary would still read PASS. A check that
// cannot render a verdict is not a pass: record it and fail the gate.
const crashed = [];
for (const s of ['gate-b-technical.mjs', 'gate-b-pause.mjs', 'gate-b-rate.mjs', 'gate-b-i05.mjs', 'gate-b-audio-identity.mjs', 'gate-b-i08.mjs', 'gate-b-pronunciation.mjs']) {
  const r = await run('node', [`scripts/qa/${s}`, id]);
  process.stdout.write(r.stdout);
  if (r.code === 2) console.log(`  (skipped: ${r.stderr.trim().split('\n').pop()})`);
  else if (r.code !== 0 && !r.stdout.trim()) {
    crashed.push(s);
    console.log(`  ✗ ${s} CRASHED — no verdict produced:`);
    for (const ln of r.stderr.trim().split('\n').slice(0, 6)) console.log(`      ${ln}`);
  }
  console.log('');
}
const doc = existsSync(P.qa) ? await readJson(P.qa) : { findings: [] };
const gb = doc.findings.filter((f) => f.gate === 'B');
const nb = gb.filter((f) => f.severity === 'BLOCK'), nw = gb.filter((f) => f.severity === 'WARN');
console.log('── Gate B summary ──');
const verdict = nb.length || crashed.length ? 'FAIL — do not publish'
  : 'PASS' + (nw.length ? ' with warnings' : '');
console.log(`  ${nb.length} BLOCK, ${nw.length} WARN  →  ${verdict}`);
if (crashed.length) console.log(`  ${crashed.length} check(s) produced NO verdict: ${crashed.join(', ')}`);
console.log(`  report: qa/${id}.json`);
process.exit(nb.length || crashed.length ? 1 : 0);
