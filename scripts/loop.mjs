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
//   node --env-file=.env scripts/loop.mjs --rebuild <id> …   # re-run finished lesson(s)
//
// Requires: rclone remote `gdrive:` (nexterastudio) — env MOSAIC_GDRIVE_REMOTE
// overrides.
//
// v5 (2026-08-16) is the canonical config and DELIVERS 4K. A 4K pass measured
// ~25 min/lesson on this machine, so there is no reason to ship 540p and re-render
// later: full quality is the default and --preview is the opt-out for a fast look.
// The 46-lesson batch under ClaudeAI/Youtube/French predates v5 and is abandoned;
// v5 publishes to "Mosaic New folder/v5" and that root is permanent.

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE = process.env.MOSAIC_GDRIVE_REMOTE || 'gdrive';
const BASE = `${REMOTE}:${process.env.MOSAIC_GDRIVE_BASE || 'Mosaic New folder/v5'}`;
const INTAKE = `${BASE}/_INTAKE`;
const RCLONE = process.env.RCLONE || `${process.env.HOME}/.local/bin/rclone`;
const REMO = path.join(ROOT, 'node_modules/.bin/remotion');
const args = process.argv.slice(2);
// 4K is the deliverable, so it is the default. --preview renders 960x540 for a quick
// look; --hq is kept as a no-op alias so older notes/scripts don't silently downgrade.
const HQ = !args.includes('--preview');
// The render name must state what it IS. This file used to write every render to
// "…-method-540p.mp4" even under --hq, so a 4K master sat on disk claiming to be a
// preview and publish() shipped it under that name.
const QUALITY = HQ ? '4k' : '540p';
const renderPath = (id, suffix = '') => path.join(ROOT, `out/${id}-method-${QUALITY}${suffix}.mp4`);
const MATCH = args.includes('--match') ? new RegExp(args[args.indexOf('--match') + 1]) : null;
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit', ...opts });
const shOut = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8' });
// Retry rclone — Drive/network hiccups are transient and must NOT halt a 50-lesson
// run. Gate blocks are not rclone calls, so this never masks a real failure.
const rclone = (a, capture = false) => {
  for (let att = 1; att <= 4; att++) {
    try { return capture ? shOut(RCLONE, a) : sh(RCLONE, a); }
    catch (e) { if (att === 4) throw e; execFileSync('sleep', [String(att * 3)]); }
  }
};
const log = (m) => console.log(`\n▶ ${m}`);
// Drive-side branding: published folders + files read "Mosaic_…" not "Say_It_…"
// (the workbooks/lesson ids keep their names; only what lands on Drive is rebranded).
const brand = (s) => String(s).replace(/^Say[ _]?It/i, 'Mosaic');

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
  const bid = brand(id);                    // Mosaic_… folder + file names on Drive
  const lessonFolder = `${BASE}/${bid}`;
  rclone(['mkdir', lessonFolder]);
  const video = renderPath(id, '-norm');
  const videoAbs = existsSync(video) ? video : renderPath(id);
  const thumb = path.join(ROOT, `out/thumbnails/${id}.png`);

  // VIDEO-PATH.txt — where the render came from. It used to say the video was NOT
  // uploaded, which was true only during the Drive quota crunch; the mp4 is published
  // to this same folder now, so a note claiming otherwise sits next to the file it
  // denies and sends anyone reading it hunting for a local machine.
  let meta = '';
  try { meta = shOut(REMO, ['ffprobe', videoAbs]).match(/Duration: [0-9:.]+/)?.[0] || ''; } catch { /* ignore */ }
  const note = [
    `Mosaic lesson: ${id}`,
    `Video: ${bid}.mp4 (in this folder)`,
    `Rendered locally from:`,
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
  // Do NOT include the shared image library (public/assets/images/*) — it is the SAME
  // 847 files for every lesson (~1.4GB), lives in the repo + registry, and bundling it
  // per lesson filled the whole Drive. registry.json records which images to use.
  const zip = path.join(ROOT, `build/${id}/${id}-bundle.zip`);
  await rm(zip, { force: true });
  const inZip = [
    `lessons/${id}.md`, `src/data/lessons/${id}.method.json`, `build/${id}/manifest.json`,
    `public/assets/audio/${id}`, `assets/images/registry.json`,
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
  // Best-effort Drive publish — a Drive error (e.g. quota) warns and continues so the
  // render run never halts on it. The bundle no longer carries the shared 1.4GB image
  // library, so it (and the video) can go to Drive now that there's storage.
  const put = (src, dst) => { try { rclone(['copyto', src, dst]); } catch (e) { console.log(`  (Drive publish skipped for ${path.basename(dst)}: ${String(e.message).split('\n')[0].slice(0, 80)})`); } };
  put(noteLocal, `${lessonFolder}/VIDEO-PATH.txt`);
  if (existsSync(videoAbs)) put(videoAbs, `${lessonFolder}/${bid}.mp4`);
  if (existsSync(zip)) put(zip, `${lessonFolder}/${bid}-bundle.zip`);
  if (existsSync(thumb)) put(thumb, `${lessonFolder}/${bid}-thumbnail.png`);
  if (ytTxt && existsSync(ytTxt)) put(ytTxt, `${lessonFolder}/${bid}-youtube.txt`);

  // The reviewer's folder should be readable WITHOUT unzipping. These four are
  // already inside the bundle, but a human checking the video wants the gate report
  // and the transcript open in a browser tab, not extracted from a 1.5GB archive.
  const alsoPublish = [
    [`qa/${id}.json`, `${bid}-gate-report.json`],              // every finding, both gates
    [`lessons/${id}.md`, `${bid}-transcript.md`],              // the authored Method transcript
    [`src/data/lessons/${id}.method.json`, `${bid}-lesson.json`], // baked lesson (slides + beats)
    [`build/${id}/manifest.json`, `${bid}-manifest.json`],     // per-beat timing the gates measured
  ];
  for (const [rel, name] of alsoPublish) {
    const abs = path.join(ROOT, rel);
    if (existsSync(abs)) put(abs, `${lessonFolder}/${name}`);
    else console.log(`  (not published — missing ${rel})`);
  }
}

// -- full pipeline for one workbook -------------------------------------------
// rebuild = re-run an ALREADY-COMPLETED lesson (e.g. to pick up an authoring fix).
// Two things must not happen on a rebuild:
//   - the workbook is no longer in the intake (it was moved to …-done.xlsx), so the
//     local copy under build/_a1dry is the source;
//   - its words are already in the lexicon, and gate-a --promote-lexicon REFUSES a
//     duplicate lesson, which would exit non-zero and halt the batch.
async function processWorkbook(name, { rebuild = false } = {}) {
  // Lesson id = the workbook filename (minus .xlsx) — named exactly as in Excel.
  const id = name.replace(/\.xlsx$/i, '');

  let localWb;
  if (rebuild) {
    localWb = path.join(ROOT, `build/_a1dry/${name}`);
    if (!existsSync(localWb)) throw new Error(`rebuild: workbook not found locally — ${localWb}`);
    log(`rebuild ${id} (local workbook; lexicon already promoted)`);
  } else {
    localWb = path.join(ROOT, `build/_intake/${name}`);
    await mkdir(path.dirname(localWb), { recursive: true });
    log(`download ${name}`);
    rclone(['copyto', `${INTAKE}/${name}`, localWb]);
  }

  log(`author ${id}`);           sh('node', ['scripts/author-v2.mjs', localWb], { env: { ...process.env, MOSAIC_LESSON_ID: id } });
  // Gate A gates (exit≠0 on BLOCK → loop stops) AND promotes this lesson's words to
  // the lexicon on pass, so the NEXT lesson's V-01 allowed-set includes them. Lessons
  // must therefore run in order (the intake is alphabetical: L01, L02, …).
  log(rebuild ? 'Gate A (no promote — already in lexicon)' : 'Gate A + promote');
  sh('node', ['scripts/qa/gate-a.mjs', id, ...(rebuild ? [] : ['--promote-lexicon'])]);
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
  const outMp4 = renderPath(id);
  // --props targets THIS lesson's baked JSON (the composition is generic LessonFilm).
  // --timeout guards a single slow frame — the intro/outro are VIDEO components and
  // Remotion's per-frame seek can stall for minutes under CPU contention. A single
  // stall must NOT kill a 50-lesson batch, so render is retried with progressively
  // safer settings (more concurrency→less, longer timeout) before we give up.
  const propArg = `--props=${path.join(ROOT, `src/data/lessons/${id}.method.json`)}`;
  const scaleArg = HQ ? '--scale=1' : '--scale=0.25';
  // Remotion's default CRF put the first 4K master at 4.4 Mbps, which trips T-03
  // (spec wants >=45 Mbps H.264) and is thin for what YouTube re-encodes. Pin the
  // rate explicitly on the delivery render; a preview is disposable, so leave it.
  const rateArgs = HQ ? ['--video-bitrate=50M', '--audio-bitrate=384k'] : [];
  // MOSAIC_RENDER_CONCURRENCY pins the STARTING concurrency. The ladder below only
  // helps when a render fails and returns; it cannot help when the whole node process
  // is killed mid-render (five runs died at 8483/8494/8603/8630/8646 frames — a
  // 163-frame band across five different films — taking the loop down with them, so
  // no retry ever ran). Lowering the start cuts the peak memory a render holds.
  // A 4K frame is 16x the pixels of the 540p preview, so the same concurrency holds
  // 16x the peak memory — which is what killed those five runs. Start 4K at 2.
  const startConc = Number(process.env.MOSAIC_RENDER_CONCURRENCY) || (HQ ? 2 : 4);
  const ladder = [[4, 600000], [2, 900000], [1, 1200000]].filter(([c]) => c <= startConc);
  const attempts = (ladder.length ? ladder : [[startConc, 1200000]])
    .map(([c, t]) => [`--concurrency=${c}`, `--timeout=${t}`]);
  let rendered = false;
  for (let a = 0; a < attempts.length; a++) {
    try {
      if (a) log(`render retry ${a} (${attempts[a].join(' ')})`);
      sh(REMO, ['render', 'Lesson-01-Method', outMp4, propArg, scaleArg, ...rateArgs, ...attempts[a]]);
      rendered = true; break;
    } catch (e) {
      console.log(`  render attempt ${a + 1}/${attempts.length} failed: ${String(e.message).split('\n')[0]}`);
    }
  }
  if (!rendered) throw new Error(`render failed after ${attempts.length} attempts — ${id}`);
  const normMp4 = renderPath(id, '-norm');
  log('loudnorm');               sh('node', ['scripts/pipeline/normalize.mjs', outMp4, normMp4]);
  // Gate B — POST-render audio/content checks (pronunciation round-trip, AV-sync,
  // input-return identity, rate). Runs whisper on the render (~2-3 min). T-01
  // (resolution) and T-05 (loudness) BLOCK at 540p by design, so they're tolerated
  // in a --preview run ONLY. A 4K delivery render tolerates nothing: T-01 there means
  // the master really is the wrong size, which is exactly what must not ship.
  log('Gate B (audio/content)');
  try { execFileSync('node', ['scripts/qa/gate-b.mjs', id], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, MOSAIC_QA_VIDEO: normMp4 } }); } catch { /* exit 1 on any block — inspect below */ }
  const gbDoc = existsSync(path.join(ROOT, `qa/${id}.json`)) ? JSON.parse(await readFile(path.join(ROOT, `qa/${id}.json`), 'utf8')) : { findings: [] };
  const tolerated = HQ ? [] : ['T-01', 'T-05'];
  const gbBlocks = (gbDoc.findings || []).filter((f) => f.severity === 'BLOCK' && !tolerated.includes(f.rule));
  if (gbBlocks.length) throw new Error(`Gate B blocks (${[...new Set(gbBlocks.map((f) => f.rule))].join(', ')}) — do not publish ${id}`);

  log('thumbnail');              sh('node', ['scripts/thumbnail.mjs', id]);

  await publish(id);

  if (rebuild) {
    console.log(`✓ ${id} rebuilt and republished (workbook already marked done)`);
    return;
  }

  log(`mark done → move ${name} out of intake`);
  const base = name.replace(/\.xlsx$/i, '');
  rclone(['moveto', `${INTAKE}/${name}`, `${BASE}/${brand(id)}/${brand(base)}-done.xlsx`]);
  console.log(`✓ ${id} complete — workbook moved to ${id}/${base}-done.xlsx`);
}

// -- entry --------------------------------------------------------------------
if (args.includes('--rebuild')) {
  // node --env-file=.env scripts/loop.mjs --rebuild <id> [<id> …]
  const ids = args.slice(args.indexOf('--rebuild') + 1).filter((a) => !a.startsWith('--'));
  if (!ids.length) { console.error('--rebuild needs at least one lesson id'); process.exit(2); }
  console.log(`rebuilding ${ids.length} lesson(s): ${ids.join(', ')}`);
  const failed = [];
  for (const id of ids) {
    // One bad lesson must not strand the rest of the batch — collect and report.
    try { await processWorkbook(`${id}.xlsx`, { rebuild: true }); }
    catch (e) { console.error(`\n✗ ${id}: ${(e && e.message) || e}`); failed.push(id); }
  }
  console.log(`\n${ids.length - failed.length}/${ids.length} rebuilt${failed.length ? ` — FAILED: ${failed.join(', ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
} else if (args.includes('--publish')) {
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
