#!/usr/bin/env node
// Shorts build (read-only inputs) — turn mined candidates into rendered vertical
// Shorts, THREE hook variants each (_h1/_h2/_h3, identical body) for A/B testing.
// Cuts the target French straight out of the FINISHED lesson video (no re-synthesis),
// generates the English hook voice-over, resolves the item image + optional music
// bed, renders, extracts a REVEAL thumbnail, and writes per-short metadata.
//
//   node scripts/shorts/build.mjs <lesson-id> [--only <candId>] [--top N]
//                                 [--variants h1,h2,h3] [--no-voice] [--overlay] [--scale 0.5]
//
// Reads  shorts/<id>/candidates.json · out/films/<id>-method-final.mp4 · registry
//        public/assets/shorts/bed.mp3 (optional music bed)
// Writes out/shorts/<cand>_<variant>.mp4 · .thumb.png · shorts/<id>/<cand>.meta.json
//        shorts/hook_performance.json
//
// Does NOT touch the lesson pipeline.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ttsClip, hasElevenKey } from '../lib/eleven.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion');
const EN_VOICE = process.env.ELEVENLABS_VOICE_EN_MAN || process.env.ELEVENLABS_VOICE_EN;
// Language accent/tint for the JOLT/brand marks — read from the shared config.
const langCfg = JSON.parse(await readFile(path.join(ROOT, 'config/languages.json'), 'utf8')).languages;

const run = (cmd, args, opts = {}) => new Promise((res) => {
  const p = spawn(cmd, args, { cwd: ROOT, ...opts });
  let out = '', err = '';
  p.stdout?.on('data', (d) => (out += d)); p.stderr?.on('data', (d) => (err += d));
  p.on('close', (code) => res({ code, out, err }));
});

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) || 'lesson-01';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const topN = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : (only ? 999 : 3);
const variants = (args.includes('--variants') ? args[args.indexOf('--variants') + 1].split(',') : ['h1', 'h2', 'h3']);
const noVoice = args.includes('--no-voice') || !hasElevenKey() || !EN_VOICE;
const overlay = args.includes('--overlay');
const scale = args.includes('--scale') ? args[args.indexOf('--scale') + 1] : '1';

const candPath = path.join(ROOT, `shorts/${id}/candidates.json`);
if (!existsSync(candPath)) { console.error(`✗ no shorts/${id}/candidates.json — run: node scripts/shorts/mine.mjs ${id}`); process.exit(2); }
const video = path.join(ROOT, `out/films/${id}-method-final.mp4`);
if (!existsSync(video)) { console.error(`✗ no finished lesson video: out/films/${id}-method-final.mp4`); process.exit(2); }
const lang = (id.match(/-(fr|es|it|pt|de)\b/)?.[1]) || 'fr';
const theme = { accent: langCfg[lang]?.accent, tint: langCfg[lang]?.tint };
const bedRel = existsSync(path.join(ROOT, 'public/assets/shorts/bed.mp3')) ? 'assets/shorts/bed.mp3' : null;

const reg = existsSync(path.join(ROOT, 'assets/images/registry.json')) ? JSON.parse(await readFile(path.join(ROOT, 'assets/images/registry.json'), 'utf8')) : { items: {} };
const imageFor = (item) => reg.items?.[item]?.file || null;
const meta = JSON.parse(await readFile(path.join(ROOT, `src/data/lessons/${id}.method.json`), 'utf8')).meta;
const level = meta.level || 'A1';
const langName = { fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', de: 'German' }[lang];

const clamp = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const tag = (s) => '#' + String(s).replace(/[^a-z0-9]+/gi, '');

async function hookVoice(candId, variant, text) {
  if (noVoice) return null;
  const h = createHash('sha1').update(`${EN_VOICE}|${text}`).digest('hex').slice(0, 12);
  const rel = `assets/shorts/${candId}/hook_${h}.mp3`;
  const abs = path.join(ROOT, 'public', rel);
  if (existsSync(abs)) return rel;               // content-addressed cache — re-renders are free
  await mkdir(path.dirname(abs), { recursive: true });
  try { await ttsClip({ text, voiceId: EN_VOICE, outAbs: abs, speed: 1, atempo: 1 }); return rel; }
  catch { return null; }
}

const { candidates } = JSON.parse(await readFile(candPath, 'utf8'));
const chosen = (only ? candidates.filter((c) => c.id === only) : candidates).slice(0, topN);
if (!chosen.length) { console.error('✗ no matching candidate'); process.exit(2); }

const perfPath = path.join(ROOT, 'shorts/hook_performance.json');
const perf = existsSync(perfPath) ? JSON.parse(await readFile(perfPath, 'utf8')) : { note: 'Log 3s-retention per hook variant per short type; the generator learns which hook style wins.', byType: {}, shorts: {} };

await mkdir(path.join(ROOT, 'out/shorts'), { recursive: true });
let built = 0;
for (const c of chosen) {
  // 1. cut the target French once (shared across variants)
  let revealAudioSrc = null;
  if (c.clip?.videoStart != null) {
    const rel = `assets/shorts/${c.id}/reveal.mp3`;
    const abs = path.join(ROOT, 'public', rel);
    await mkdir(path.dirname(abs), { recursive: true });
    const r = await run(REMOTION, ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(Math.max(0, c.clip.videoStart - 0.08)), '-to', String(c.clip.videoEnd + 0.08),
      '-i', video, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', abs]);
    if (r.code === 0) revealAudioSrc = rel;
  }
  const t = c.target || {};
  const topic = (t.french || c.item || '').split('/')[0].trim();
  const meta_ = {
    id: c.id, type: c.type, lesson: id, level,
    title: clamp(c.title || c.hookSeeds[0], 45),
    description: `${c.why?.slice(0, 90) || c.hookSeeds[0]} — Full lesson: [${id}]`,
    hashtags: [tag('Learn' + langName), tag(level + langName), tag(topic || c.type)].slice(0, 3),
    thumbnailFrom: 'REVEAL',
    variants: {},
  };

  for (const v of variants) {
    const vi = v === 'h2' ? 1 : v === 'h3' ? 2 : 0;
    const hook = (c.hookSeeds || [])[vi] || c.hookSeeds?.[0] || c.why;
    const hookAudioSrc = await hookVoice(c.id, v, hook);
    const spec = {
      id: c.id, type: c.type, lesson: id, hook,
      targetFrench: t.french || c.item || '', phonetic: t.phonetic || null, english: t.english || null,
      why: c.why, imageSrc: imageFor(t.french || c.item), revealAudioSrc, hookAudioSrc, bedSrc: bedRel,
      accent: theme.accent, tint: theme.tint, safeZoneOverlay: overlay,
    };
    const outRel = `out/shorts/${c.id}_${v}.mp4`;
    process.stdout.write(`  ▶ ${c.id}_${v} (${c.type}) "${clamp(hook, 34)}"${hookAudioSrc ? ' +voice' : ''} … `);
    const r = await run(REMOTION, ['render', 'src/index.ts', 'Short', outRel, `--props=${JSON.stringify({ spec })}`, `--scale=${scale}`, '--timeout=120000', '--log=error']);
    if (r.code !== 0) { console.log(`✗\n${r.err.trim().split('\n').slice(-2).join('\n')}`); continue; }
    // REVEAL thumbnail (~12s), not from HOOK
    const thumb = `out/shorts/${c.id}_${v}.thumb.png`;
    await run(REMOTION, ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '12', '-i', outRel, '-frames:v', '1', '-q:v', '2', thumb]);
    meta_.variants[v] = { file: outRel, thumb, hook, hasVoice: Boolean(hookAudioSrc) };
    perf.shorts[c.id] ||= { type: c.type, variants: {} };
    perf.shorts[c.id].variants[v] ||= { hook, retention3s: null };
    perf.byType[c.type] ||= { winner: null, samples: 0 };
    built++;
    console.log('✓');
  }
  await writeFile(path.join(ROOT, `shorts/${id}/${c.id}.meta.json`), JSON.stringify(meta_, null, 2) + '\n');
}
await writeFile(perfPath, JSON.stringify(perf, null, 2) + '\n');
console.log(`\ndone — ${built} short file(s) → out/shorts/  (${chosen.length} candidate(s) × ${variants.length} variant(s))`);
console.log(noVoice ? '  (hook voice-over skipped — no ElevenLabs key/voice; text hook still works muted)' : '  hook voice-over generated per variant');
console.log(bedRel ? '  music bed applied (ducked, cut in REVEAL)' : '  no music bed (drop public/assets/shorts/bed.mp3 to enable)');
console.log('  next: node scripts/shorts/index.mjs ' + id + '   ·   node scripts/shorts/gate.mjs ' + id);
