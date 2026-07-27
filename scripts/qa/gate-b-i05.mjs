#!/usr/bin/env node
// GATE B · I-05 (L3) — NO French on screen during an L3+ retrieval GAP. Standalone.
//   node scripts/qa/gate-b-i05.mjs <video-id>
// Highest-consequence check. For each L3+ pause that is a RETRIEVAL GAP — one the
// learner must produce into WITHOUT having just heard the French (the nearest
// preceding voiced beat is English) — sample the frame at pause_mid, OCR it
// (rapidocr), lowercase + strip accents, and substring-match against
// allowed_set(n). ANY hit = BLOCK. Deterministic containment, not a model.
//
// A pause that FOLLOWS a French beat is a post-reveal / echo pause: the answer has
// just been spoken, so the word legitimately stays on screen (the reveal). Those
// are NOT retrieval gaps and are not checked — the blackout guards recall-from-
// memory, not the reinforcement that follows it.
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, run, ffmpegStatic, REMOTION, ROOT } from './lib.mjs';
import { rules, finding, merge, allowedSet } from './gateb.mjs';

const id = process.argv[2] || 'lesson-01';
const OCR_PY = path.join(ROOT, '.venv-ocr/bin/python');
const P = paths(id);
if (!existsSync(P.video) || !existsSync(P.manifest)) { console.error('✗ need render + manifest'); process.exit(2); }
if (!existsSync(OCR_PY)) { console.error('✗ .venv-ocr missing (rapidocr)'); process.exit(2); }
const Y = await rules();
const man = await readJson(P.manifest);
const allowed = [...await allowedSet(id)].map((s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')).filter((s) => s.length >= 2);

// Stages where the learner PRODUCES FROM MEMORY — the only place a visible French
// word is a leaked answer. Elsewhere (COLD_INPUT/notes, FRAME_INTRO, INPUT_RETURN,
// the goal/check bookends) French on screen is legitimate comprehensible INPUT, not
// a retrieval, so it is not a blackout violation.
const RETRIEVAL_STAGES = new Set(['WARM_UP', 'ITEM_BLOCK', 'MICRO_RECALL', 'BUILD_LADDER', 'MAKE_IT_YOURS', 'TRANSFER_TASK', 'FLUENCY_ROUND']);

// L3+ retrieval GAPS: a pause beat, level >= 3, in a RETRIEVAL stage, whose nearest
// preceding VOICED beat is English (an instruction/prompt). A pause after a French
// beat is the post-reveal pause — the word may stay — so it is excluded.
const events = [];
for (let i = 0; i < man.lines.length; i++) {
  const r = man.lines[i];
  if (r.kind !== 'pause' || r.durationSeconds < 1.0) continue;
  const lvl = r.supportLevel ?? man.lines[i - 1]?.supportLevel ?? -1;
  let p = i - 1; while (p >= 0 && man.lines[p].kind === 'pause') p--;
  const afterFrench = p >= 0 && man.lines[p].kind === 'french';
  const stage = r.stage ?? man.lines[p]?.stage;
  if (lvl >= 3 && r.pauseMid != null && !afterFrench && RETRIEVAL_STAGES.has(stage)) events.push({ mid: r.pauseMid, line: r.sourceLine, lvl });
}
if (!events.length) { console.log('GATE B · I-05 — 0 L3+ retrieval gaps (needs Method-grammar [Ln] tags)'); await merge(id, ['I-05'], []); process.exit(0); }

const ff = ffmpegStatic() || REMOTION; const ffPre = ff === REMOTION ? ['ffmpeg'] : [];
const dir = path.join(ROOT, `build/${id}/frames-i05`); mkdirSync(dir, { recursive: true });
const frames = [];
for (const e of events) { const fp = path.join(dir, `t${String(e.mid).replace('.', '_')}.png`); const r = await run(ff, [...ffPre, '-hide_banner', '-nostats', '-y', '-ss', String(e.mid), '-i', P.video, '-frames:v', '1', '-q:v', '2', fp]); if (r.code === 0) { e.frame = fp; frames.push(fp); } }
const ocrR = await run(OCR_PY, [path.join(ROOT, 'scripts/qa/ocr.py'), ...frames]);
const ocr = ocrR.code === 0 ? JSON.parse(ocrR.stdout) : {};
const F = [];
for (const e of events) {
  if (!e.frame) continue;
  const boxes = ocr[e.frame]; if (!Array.isArray(boxes)) continue;
  const screen = boxes.map((b) => b.text).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hit = allowed.find((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(screen));
  if (hit) F.push(finding(Y, 'I-05', e.line || 0, `French "${hit}" visible on screen during an L${e.lvl} retrieval pause at ${e.mid}s`, `OCR: ${screen.slice(0, 80)}`));
}
await merge(id, ['I-05'], F, { i05_checked: events.length });
console.log(`GATE B · I-05 — ${events.length} L3+ pauses OCR'd against ${allowed.length} allowed words`);
if (!F.length) console.log('  ✓ no French on screen during any retrieval pause.');
else for (const f of F) console.log(`  ✗ ${f.issue}`);
process.exit(F.length ? 1 : 0);
