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

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit', ...opts });
const shOut = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8' });
const rclone = (a, capture = false) => (capture ? shOut(RCLONE, a) : sh(RCLONE, a));
const log = (m) => console.log(`\n▶ ${m}`);

// -- intake listing -----------------------------------------------------------
function intakeWorkbooks() {
  const out = rclone(['lsf', INTAKE, '--files-only'], true);
  return out.split('\n').map((s) => s.trim()).filter((s) => /\.xlsx$/i.test(s) && !/-done\.xlsx$/i.test(s));
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

  log(`publish ${id} → ${lessonFolder}`);
  rclone(['copyto', noteLocal, `${lessonFolder}/VIDEO-PATH.txt`]);
  rclone(['copyto', zip, `${lessonFolder}/${id}-bundle.zip`]);
  if (existsSync(thumb)) rclone(['copyto', thumb, `${lessonFolder}/${id}-thumbnail.png`]);
}

// -- full pipeline for one workbook -------------------------------------------
async function processWorkbook(name) {
  const localWb = path.join(ROOT, `build/_intake/${name}`);
  await mkdir(path.dirname(localWb), { recursive: true });
  log(`download ${name}`);
  rclone(['copyto', `${INTAKE}/${name}`, localWb]);

  const wb = XLSX.readFile(localWb);
  const brief = {};
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets['Lesson_Brief'], { header: 1, defval: '' }))
    if (r[0] && r[1] && r[0] !== 'Field') brief[String(r[0]).trim()] = String(r[1]).trim();
  const id = `lesson-${String(Number(brief.lesson) || 1).padStart(2, '0')}`;

  log(`author ${id}`);           sh('node', ['scripts/author-from-excel.mjs', localWb]);
  log('Gate A');                 sh('node', ['scripts/qa/gate-a.mjs', id]); // exits non-zero on BLOCK → loop stops
  log('registry');               sh('node', ['scripts/images/registry.mjs', localWb]);
  log('images: generate + bind'); try { sh('node', ['scripts/images/generate.mjs']); } catch { console.log('  (generation skipped/failed — placeholders will show)'); }
  sh('node', ['scripts/images/bind.mjs', id]);
  log(`bake audio ${id}`);       sh('node', ['scripts/build-method-lesson.mjs', id]);
  sh('node', ['scripts/images/bind.mjs', id]); // rebind after bake rebuilt the JSON
  log('manifest');               sh('node', ['scripts/qa/manifest.mjs', id]);
  log(`render ${HQ ? '4K' : '540p'}`);
  const outMp4 = path.join(ROOT, `out/${id}-method-540p.mp4`);
  sh(REMO, ['render', 'Lesson-01-Method', outMp4, ...(HQ ? ['--scale=1'] : ['--scale=0.25']), '--concurrency=6']);
  log('loudnorm');               sh('node', ['scripts/pipeline/normalize.mjs', outMp4, path.join(ROOT, `out/${id}-method-540p-norm.mp4`)]);
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
