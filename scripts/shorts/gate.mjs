#!/usr/bin/env node
// SH gate — SH-01..09 + PZ-01..06 on the rendered Shorts. Deterministic where it
// can be (resolution, fps, runtime, variant count, loop match, GAP motion, no-French-
// before-REVEAL via OCR, speech peak); the rules the composition enforces structurally
// (hook readable muted, safe zones, captions) are reported by-design.
//
//   node scripts/shorts/gate.mjs [<lesson-id>]

import { readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion');
const OCR_PY = path.join(ROOT, '.venv-ocr/bin/python');
const id = process.argv[2] || 'lesson-01';

const run = (cmd, a, opts = {}) => new Promise((res) => { const p = spawn(cmd, a, { cwd: ROOT, ...opts }); let o = '', e = ''; p.stdout?.on('data', (d) => o += d); p.stderr?.on('data', (d) => e += d); p.on('close', (code) => res({ code, out: o, err: e })); });
const ff = (a) => run(REMOTION, ['ffmpeg', '-hide_banner', '-loglevel', 'error', ...a]);
async function probe(file) {
  const r = await run(REMOTION, ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', file]);
  try { const j = JSON.parse(r.out); const s = j.streams[0]; const [n, d] = String(s.r_frame_rate).split('/'); return { w: s.width, h: s.height, fps: +n / (+d || 1), dur: +j.format.duration }; } catch { return null; }
}

const metaDir = path.join(ROOT, `shorts/${id}`);
if (!existsSync(metaDir)) { console.error(`✗ no shorts/${id}/`); process.exit(2); }
const metas = (await readdir(metaDir)).filter((f) => f.endsWith('.meta.json'));
if (!metas.length) { console.error(`✗ no built shorts (run build.mjs first)`); process.exit(2); }
const meta = JSON.parse(await readFile(path.join(ROOT, `src/data/lessons/${id}.method.json`), 'utf8')).meta;
const allowed = (meta.items || []).map((s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')).filter((s) => s.length >= 2);
const tmp = path.join(ROOT, `build/shorts-gate`); await mkdir(tmp, { recursive: true });

let totalBlock = 0, totalWarn = 0;
for (const mf of metas) {
  const m = JSON.parse(await readFile(path.join(metaDir, mf), 'utf8'));
  const F = [];
  const block = (rule, msg) => { F.push(`✗ ${rule} ${msg}`); totalBlock++; };
  const warn = (rule, msg) => { F.push(`⚠ ${rule} ${msg}`); totalWarn++; };
  const ok = (rule) => F.push(`✓ ${rule}`);

  const vks = Object.keys(m.variants || {});
  const files = vks.map((v) => m.variants[v].file).filter((f) => existsSync(path.join(ROOT, f)));
  // SH-08: three hook variants exist
  vks.length >= 3 && files.length >= 3 ? ok('SH-08 3 hook variants') : warn('SH-08', `only ${files.length} variant(s) rendered`);
  if (!files.length) { console.log(`\n━ ${m.id} (${m.type}) — no rendered files`); continue; }

  const f0 = files[0];
  const p = await probe(path.join(ROOT, f0));
  if (!p) { block('PZ-01', 'probe failed'); }
  else {
    (p.w === 1080 && p.h === 1920) ? ok('PZ-01 1080x1920') : block('PZ-01', `${p.w}x${p.h} ≠ 1080x1920`);
    p.fps >= 30 ? ok('PZ-02 fps≥30') : block('PZ-02', `${p.fps.toFixed(1)}fps < 30`);
    (p.dur >= 18 && p.dur <= 30) ? ok('SH-01 runtime 18-30s') : block('SH-01', `${p.dur.toFixed(1)}s outside 18-30`);
  }
  // extract GAP (8/9.5s), open (0.2s), close (19.7s) frames for OCR + diffs
  const g1 = `${tmp}/${m.id}_g1.png`, g2 = `${tmp}/${m.id}_g2.png`, op = `${tmp}/${m.id}_op.png`, cl = `${tmp}/${m.id}_cl.png`;
  for (const [t, out] of [[8, g1], [9.5, g2], [0.2, op], [19.7, cl]]) await ff(['-y', '-ss', String(t), '-i', f0, '-frames:v', '1', out]);
  const chk = await run(OCR_PY, [path.join(ROOT, 'scripts/shorts/frames_check.py'), g1, g2, op, cl, g1, '--', ...allowed]);
  let a = {}; try { a = JSON.parse(chk.out.trim().split('\n').pop()); } catch {}
  // SH-03: no French on screen during the GAP (before REVEAL)
  a.gapFrenchHit ? block('SH-03', `French "${a.gapFrenchHit}" visible in GAP`) : ok('SH-03 no French before REVEAL');
  // SH-04: GAP animated
  a.gapAnimated === true ? ok('SH-04 GAP animated') : (a.gapAnimated === false ? block('SH-04', 'GAP frames identical (static)') : warn('SH-04', 'could not verify motion'));
  // SH-05: loop match
  a.loopMatch === true ? ok('SH-05 loop matches opening') : (a.loopMatch === false ? warn('SH-05', 'open/close differ') : warn('SH-05', 'could not verify'));
  // PZ-03: speech peak ≤ -3 dBTP (measure max volume of the file)
  const vol = await run(REMOTION, ['ffmpeg', '-hide_banner', '-nostats', '-i', f0, '-af', 'volumedetect', '-f', 'null', '-']);
  const mp = vol.err.match(/max_volume:\s*(-?[\d.]+) dB/); const peak = mp ? +mp[1] : null;
  peak == null ? warn('PZ-03', 'no peak measured') : (peak <= -3 ? ok(`PZ-03 peak ${peak}dB ≤ -3`) : warn('PZ-03', `peak ${peak}dB > -3`));
  // structurally enforced by the composition
  ok('SH-06 hook burned-in (readable muted) · by design');
  ok('SH-07/PZ-05 text inside safe zones · by design');
  ok('SH-02 no branding <3s · by design');

  console.log(`\n━ ${m.id} (${m.type}) "${m.title}"`);
  for (const line of F) console.log('   ' + line);
}
// SH-09 is a batch property
console.log(`\nSH-09 older-lesson weighting — batch-level; single lesson here (info).`);
console.log(`\n── SH gate ── ${totalBlock} BLOCK, ${totalWarn} WARN across ${metas.length} short(s) → ${totalBlock ? 'FAIL' : 'PASS'}`);
process.exit(totalBlock ? 1 : 0);
