#!/usr/bin/env node
// Mosaic lesson LOOP — pick up workbooks from the Drive intake, run the whole
// pipeline, publish the lesson's artifacts to its Drive folder (NOT the heavy
// video — a VIDEO-PATH.txt points to the local render), then move the workbook
// into the lesson folder renamed "…-done.xlsx" so the intake empties. An empty
// intake means the series is finished.
//
//   node --env-file=.env scripts/loop.mjs            # process every workbook in intake
//   node --env-file=.env scripts/loop.mjs --publish lesson-01   # just (re)publish one already-built lesson
//   node --env-file=.env scripts/loop.mjs --list     # show what's waiting in intake
//
// Requires: rclone remote `gdrive:` (nexterastudio) — env MOSAIC_GDRIVE_REMOTE
// overrides. Render quality: 540p preview by default (fast); --hq for 4K.

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE = process.env.MOSAIC_GDRIVE_REMOTE || 'gdrive';
const BASE = `${REMOTE}:${process.env.MOSAIC_GDRIVE_BASE || 'ClaudeAI/Youtube/French'}`;
const INTAKE = `${BASE}/_INTAKE`;
const RCLONE = process.env.RCLONE || `${process.env.HOME}/.local/bin/rclone`;
const REMO = path.join(ROOT, 'node_modules/.bin/remotion');
const args = process.argv.slice(2);
const HQ = args.includes('--hq');
const MATCH = args.includes('--match') ? new RegExp(args[args.indexOf('--match') + 1]) : null;
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit', ...opts });
const shOut = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8' });
const rclone = (a, capture = false) => (capture ? shOut(RCLONE, a) : sh(RCLONE, a));
const log = (m) => console.log(`\n▶ ${m}`);

// -- intake listing -----------------------------------------------------------
function intakeWorkbooks() {
  const out = rclone(['lsf', INTAKE, '--files-only'], true);
  let list = out.split('\n').map((s) => s.trim()).filter((s) => /\.xlsx$/i.test(s) && !/-done\.xlsx$/i.test(s));
  if (MATCH) list = list.filter((s) => MATCH.test(s));
  return list.slice(0, LIMIT);
}

if (args.includes('--list')) {
  const wb = intakeWorkbooks();
  console.log(wb.length ? `intake (${wb.length}):\n  ${wb.join('\n  ')}` : 'intake is EMPTY — series done.');
  process.exit(0);
}

// -- build the reloadable bundle + the video-path note, then push to Drive -----
async function publish(id) {
  const lessonFolder = `${BASE}/${id}`;
  rclone(['mkdir', lessonFolder]);
  const video = path.join(ROOT, `out/${id}-method-540p-norm.mp4`);
  const videoAbs = existsSync(video) ? video : path.join(ROOT, `out/${id}-method-540p.mp4`);
  const thumb = path.join(ROOT, `out/thumbnails/${id}.png`);

  // VIDEO-PATH.txt — the render stays local (too big/slow to upload); this is the pointer.
  let meta = '';
  try { meta = shOut(REMO, ['ffprobe', videoAbs]).match(/Duration: [0-9:.]+/)?.[0] || ''; } catch { /* ignore */ }
  const note = [
    `Mosaic lesson: ${id}`,
    `Rendered video (LOCAL — not uploaded, too large):`,
    `  ${videoAbs}`,
    meta && `  ${meta}`,
    `Thumbnail: ${id}-thumbnail.png (in this folder)`,
    `Bundle: ${id}-bundle.zip (reloadable project: transcript + baked JSON + audio + images)`,
    `Generated: run \`node scripts/loop.mjs --publish ${id}\` to refresh.`,
  ].filter(Boolean).join('\n') + '\n';
  const noteLocal = path.join(ROOT, `build/${id}/VIDEO-PATH.txt`);
  await mkdir(path.dirname(noteLocal), { recursive: true });
  await writeFile(noteLocal, note);

  // Bundle the reloadable project (everything the video was built from, minus the mp4).
  const zip = path.join(ROOT, `build/${id}/${id}-bundle.zip`);
  await rm(zip, { force: true });
  const inZip = [
    `lessons/${id}.md`, `src/data/lessons/${id}.method.json`, `build/${id}/manifest.json`,
    `public/assets/audio/${id}`, `assets/images/registry.json`,
    `public/assets/images/items`, `public/assets/images/scenes`,
    existsSync(path.join(ROOT, `qa/${id}.json`)) ? `qa/${id}.json` : null,
    existsSync(thumb) ? `out/thumbnails/${id}.png` : null,
  ].filter((p) => p && existsSync(path.join(ROOT, p)));
  sh('zip', ['-r', '-q', zip, ...inZip]);

  // Copy-paste YouTube metadata for MANUAL upload (title/description/tags).
  let ytTxt = path.join(ROOT, `out/${id}-youtube.txt`);
  try {
    const meta = JSON.parse(await readFile(path.join(ROOT, `src/data/lessons/${id}.method.json`), 'utf8')).meta || {};
    sh('node', ['scripts/youtube/publish.mjs', '--lang', meta.language || 'fr', '--lesson', String(meta.lesson || Number(id.replace(/\D/g, '')) || 1), '--id', id, '--paste']);
  } catch (e) { console.log(`  (youtube metadata skipped: ${e.message})`); ytTxt = null; }

  log(`publish ${id} → ${lessonFolder}`);
  rclone(['copyto', noteLocal, `${lessonFolder}/VIDEO-PATH.txt`]);
  rclone(['copyto', zip, `${lessonFolder}/${id}-bundle.zip`]);
  if (existsSync(thumb)) rclone(['copyto', thumb, `${lessonFolder}/${id}-thumbnail.png`]);
  if (ytTxt && existsSync(ytTxt)) rclone(['copyto', ytTxt, `${lessonFolder}/${id}-youtube.txt`]);
}

// -- full pipeline for one workbook -------------------------------------------
async function processWorkbook(name) {
  const localWb = path.join(ROOT, `build/_intake/${name}`);
  await mkdir(path.dirname(localWb), { recursive: true });
  log(`download ${name}`);
  rclone(['copyto', `${INTAKE}/${name}`, localWb]);

  // Lesson id = the workbook filename (minus .xlsx) — named exactly as in Excel.
  const id = name.replace(/\.xlsx$/i, '');

  log(`author ${id}`);           sh('node', ['scripts/author-v2.mjs', localWb], { env: { ...process.env, MOSAIC_LESSON_ID: id } });
  // Gate A gates (exit≠0 on BLOCK → loop stops) AND promotes this lesson's words to
  // the lexicon on pass, so the NEXT lesson's V-01 allowed-set includes them. Lessons
  // must therefore run in order (the intake is alphabetical: L01, L02, …).
  log('Gate A + promote');       sh('node', ['scripts/qa/gate-a.mjs', id, '--promote-lexicon']);
  log('registry');               sh('node', ['scripts/images/registry.mjs', localWb]);
  log('images: generate');       try { sh('node', ['scripts/images/generate.mjs']); } catch { console.log('  (generation skipped/failed — placeholders will show)'); }
  log(`bake audio ${id}`);       sh('node', ['scripts/build-method-lesson.mjs', id]);
  // Bind AFTER the bake — bind attaches registry images to the baked JSON, which
  // only exists once build-method-lesson has written it.
  log('bind images');            sh('node', ['scripts/images/bind.mjs', id]);
  // Per-speaker loudness gate — fails the build if any voice drifts from the
  // others (the whole-video −14 pass can't catch per-speaker imbalance).
  log('loudness balance');       sh('node', ['scripts/qa/loudness-balance.mjs', id]);
  log('manifest');               sh('node', ['scripts/qa/manifest.mjs', id]);
  log(`render ${HQ ? '4K' : '540p'}`);
  const outMp4 = path.join(ROOT, `out/${id}-method-540p.mp4`);
  // --props targets THIS lesson's baked JSON (the composition is generic LessonFilm).
  // --timeout guards a single slow frame — the intro/outro are VIDEO components and
  // Remotion's per-frame seek can stall for minutes under CPU contention. A single
  // stall must NOT kill a 50-lesson batch, so render is retried with progressively
  // safer settings (more concurrency→less, longer timeout) before we give up.
  const propArg = `--props=${path.join(ROOT, `src/data/lessons/${id}.method.json`)}`;
  const scaleArg = HQ ? '--scale=1' : '--scale=0.25';
  const attempts = [
    ['--concurrency=4', '--timeout=600000'],   // 10 min/frame
    ['--concurrency=2', '--timeout=900000'],   // slower, more stable
    ['--concurrency=1', '--timeout=1200000'],  // last resort: serial, 20 min/frame
  ];
  let rendered = false;
  for (let a = 0; a < attempts.length; a++) {
    try {
      if (a) log(`render retry ${a} (${attempts[a].join(' ')})`);
      sh(REMO, ['render', 'Lesson-01-Method', outMp4, propArg, scaleArg, ...attempts[a]]);
      rendered = true; break;
    } catch (e) {
      console.log(`  render attempt ${a + 1}/${attempts.length} failed: ${String(e.message).split('\n')[0]}`);
    }
  }
  if (!rendered) throw new Error(`render failed after ${attempts.length} attempts — ${id}`);
  const normMp4 = path.join(ROOT, `out/${id}-method-540p-norm.mp4`);
  log('loudnorm');               sh('node', ['scripts/pipeline/normalize.mjs', outMp4, normMp4]);
  // Gate B — POST-render audio/content checks (pronunciation round-trip, AV-sync,
  // input-return identity, rate). Runs whisper on the render (~2-3 min). T-01
  // (resolution) and T-05 (loudness) BLOCK at 540p by design, so they're tolerated
  // in the preview batch; any OTHER Gate-B block stops the loop (do not publish).
  log('Gate B (audio/content)');
  try { execFileSync('node', ['scripts/qa/gate-b.mjs', id], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, MOSAIC_QA_VIDEO: normMp4 } }); } catch { /* exit 1 on any block — inspect below */ }
  const gbDoc = existsSync(path.join(ROOT, `qa/${id}.json`)) ? JSON.parse(await readFile(path.join(ROOT, `qa/${id}.json`), 'utf8')) : { findings: [] };
  const gbBlocks = (gbDoc.findings || []).filter((f) => f.severity === 'BLOCK' && !['T-01', 'T-05'].includes(f.rule));
  if (gbBlocks.length) throw new Error(`Gate B blocks (${[...new Set(gbBlocks.map((f) => f.rule))].join(', ')}) — do not publish ${id}`);

  log('thumbnail');              sh('node', ['scripts/thumbnail.mjs', id]);

  await publish(id);

  log(`mark done → move ${name} out of intake`);
  const base = name.replace(/\.xlsx$/i, '');
  rclone(['moveto', `${INTAKE}/${name}`, `${BASE}/${id}/${base}-done.xlsx`]);
  console.log(`✓ ${id} complete — workbook moved to ${id}/${base}-done.xlsx`);
}

// -- entry --------------------------------------------------------------------
if (args.includes('--publish')) {
  const id = args[args.indexOf('--publish') + 1];
  await publish(id);
  console.log(`✓ published ${id}`);
} else {
  const workbooks = intakeWorkbooks();
  if (!workbooks.length) { console.log('intake is EMPTY — nothing to do (series done).'); process.exit(0); }
  console.log(`intake has ${workbooks.length} workbook(s): ${workbooks.join(', ')}`);
  for (const name of workbooks) await processWorkbook(name);
  console.log(`\n✓ loop complete — ${workbooks.length} lesson(s) processed. Intake is now empty.`);
}
