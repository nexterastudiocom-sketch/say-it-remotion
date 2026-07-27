#!/usr/bin/env node
// Shorts build (read-only inputs) — turn a mined candidate into a rendered vertical
// Short. Cuts the target French audio straight out of the FINISHED lesson video (no
// re-synthesis), resolves the item image, assembles the spec, and renders.
//
//   node scripts/shorts/build.mjs <lesson-id> [--only <candidateId>] [--top N]
//                                 [--variant h1|h2|h3] [--overlay] [--scale 0.5]
//
// Reads  shorts/<id>/candidates.json · out/films/<id>-method-final.mp4 · registry
// Writes public/assets/shorts/<cand>/reveal.mp3 · out/shorts/<cand>_<variant>.mp4
//
// Does NOT touch the lesson pipeline.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion');
const THEME = { fr: { accent: '#2E4FE0', tint: '#E7ECFE' }, es: { accent: '#E14B3B', tint: '#FDEAE6' }, it: { accent: '#1FA66B', tint: '#E4F6EE' }, pt: { accent: '#11998E', tint: '#E0F5F2' }, de: { accent: '#E0A100', tint: '#FBF1D6' } };

const run = (cmd, args, opts = {}) => new Promise((res) => {
  const p = spawn(cmd, args, { cwd: ROOT, ...opts });
  let out = '', err = '';
  p.stdout?.on('data', (d) => (out += d)); p.stderr?.on('data', (d) => (err += d));
  p.on('close', (code) => res({ code, out, err }));
});

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) || 'lesson-01';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const topN = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : (only ? 999 : 1);
const variant = (args.includes('--variant') ? args[args.indexOf('--variant') + 1] : 'h1');
const overlay = args.includes('--overlay');
const scale = args.includes('--scale') ? args[args.indexOf('--scale') + 1] : '1';

const candPath = path.join(ROOT, `shorts/${id}/candidates.json`);
if (!existsSync(candPath)) { console.error(`✗ no shorts/${id}/candidates.json — run: node scripts/shorts/mine.mjs ${id}`); process.exit(2); }
const video = path.join(ROOT, `out/films/${id}-method-final.mp4`);
if (!existsSync(video)) { console.error(`✗ no finished lesson video: out/films/${id}-method-final.mp4`); process.exit(2); }
const lang = (id.match(/-(fr|es|it|pt|de)\b/)?.[1]) || 'fr';
const theme = THEME[lang] || THEME.fr;

const reg = existsSync(path.join(ROOT, 'assets/images/registry.json')) ? JSON.parse(await readFile(path.join(ROOT, 'assets/images/registry.json'), 'utf8')) : { items: {} };
const imageFor = (item) => { const e = reg.items?.[item] || Object.values(reg.items || {}).find((x) => (x.image_id || '').includes((item || '').replace(/[^a-z]/gi, ''))); return e?.file || null; };

const { candidates } = JSON.parse(await readFile(candPath, 'utf8'));
const chosen = (only ? candidates.filter((c) => c.id === only) : candidates).slice(0, topN);
if (!chosen.length) { console.error('✗ no matching candidate'); process.exit(2); }

for (const c of chosen) {
  const vi = variant === 'h2' ? 1 : variant === 'h3' ? 2 : 0;
  const hook = (c.hookSeeds || [])[vi] || c.hookSeeds?.[0] || c.why;
  // 1. cut the target French audio out of the finished lesson video (no re-synth)
  let revealAudioSrc = null;
  if (c.clip && c.clip.videoStart != null) {
    const rel = `assets/shorts/${c.id}/reveal.mp3`;
    const abs = path.join(ROOT, 'public', rel);
    await mkdir(path.dirname(abs), { recursive: true });
    const pad = 0.08;
    const r = await run(REMOTION, ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(Math.max(0, c.clip.videoStart - pad)), '-to', String(c.clip.videoEnd + pad),
      '-i', video, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', abs]);
    if (r.code === 0) revealAudioSrc = rel; else console.log(`  ⚠ ${c.id}: audio cut failed`);
  }
  // 2. assemble the spec
  const t = c.target || {};
  const spec = {
    id: c.id, type: c.type, lesson: id, hook,
    targetFrench: t.french || c.item || c.target?.french || '',
    phonetic: t.phonetic || null, english: t.english || null,
    why: c.why, imageSrc: imageFor(t.french || c.item), revealAudioSrc,
    accent: theme.accent, tint: theme.tint, safeZoneOverlay: overlay,
  };
  const specRel = `shorts/${id}/${c.id}_${variant}.spec.json`;
  await writeFile(path.join(ROOT, specRel), JSON.stringify(spec, null, 2) + '\n');
  // 3. render
  await mkdir(path.join(ROOT, 'out/shorts'), { recursive: true });
  const outRel = `out/shorts/${c.id}_${variant}.mp4`;
  process.stdout.write(`  ▶ ${c.id} (${c.type}) "${hook.slice(0, 40)}" → ${outRel} … `);
  const r = await run(REMOTION, ['render', 'src/index.ts', 'Short', outRel, `--props=${JSON.stringify({ spec })}`, `--scale=${scale}`, '--timeout=120000', '--log=error']);
  console.log(r.code === 0 ? '✓' : `✗\n${r.err.trim().split('\n').slice(-3).join('\n')}`);
}
console.log(`\ndone — ${chosen.length} short(s) → out/shorts/`);
