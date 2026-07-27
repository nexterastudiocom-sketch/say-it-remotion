#!/usr/bin/env node
// GATE B · S-08 (L2) — INPUT_RETURN replays the SAME recording as COLD_INPUT.
//   node scripts/qa/gate-b-audio-identity.mjs <video-id>
//
// The Method rule is about the replayed PASSAGE, not the framing: the English
// setup line legitimately differs ("listen" vs "notice how much more you catch"),
// so we compare the shared French dialogue clips — the actual utterances the
// learner hears twice — and require them byte-identical, in order. The baker
// content-addresses clips, so a faithful replay resolves to the very same files.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { paths, readJson, ROOT } from './lib.mjs';
import { rules, finding, merge } from './gateb.mjs';

const id = process.argv[2] || 'lesson-01';
const P = paths(id);
if (!existsSync(P.manifest)) { console.error('✗ need manifest'); process.exit(2); }
const Y = await rules();
const man = await readJson(P.manifest);
// The dialogue the learner re-hears = the French lines inside each input stage.
const dlg = (stage) => man.lines.filter((r) => r.stage === stage && r.kind === 'french' && r.audioAsset).map((r) => r.audioAsset);
const cold = dlg('COLD_INPUT'), ret = dlg('INPUT_RETURN');
if (!cold.length || !ret.length) { console.log('GATE B · S-08 — COLD_INPUT/INPUT_RETURN dialogue not found (needs Method-grammar lesson)'); await merge(id, ['S-08'], []); process.exit(0); }

const hashOf = async (rel) => { const abs = path.join(ROOT, 'public', rel); return existsSync(abs) ? createHash('sha256').update(await readFile(abs)).digest('hex') : null; };
const coldH = await Promise.all(cold.map(hashOf));
const retH = await Promise.all(ret.map(hashOf));
const F = [];
// Every replayed clip, in order, must byte-match the cold clip in the same slot.
const n = Math.min(coldH.length, retH.length);
let mismatch = -1;
if (coldH.length !== retH.length) mismatch = n; // length differs → the passage was changed
else for (let i = 0; i < n; i++) if (!coldH[i] || !retH[i] || coldH[i] !== retH[i]) { mismatch = i; break; }
if (mismatch >= 0) {
  const c = coldH[mismatch], r = retH[mismatch];
  F.push(finding(Y, 'S-08', 0,
    `INPUT_RETURN dialogue is not the same recording as COLD_INPUT (${ret.length} vs ${cold.length} clips${mismatch < n ? `, first differs at clip ${mismatch + 1}` : ''})`,
    mismatch < n ? `sha256 ${(c || 'MISSING').slice(0, 12)} ≠ ${(r || 'MISSING').slice(0, 12)}` : 'clip count differs'));
}
await merge(id, ['S-08'], F);
console.log(`GATE B · S-08 — ${cold.length} cold dialogue clips vs ${ret.length} replayed`);
console.log(F.length ? '  ✗ replay is not the same recording' : '  ✓ identical recording replayed.');
process.exit(F.length ? 1 : 0);
