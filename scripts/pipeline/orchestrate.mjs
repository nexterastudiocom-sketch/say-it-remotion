#!/usr/bin/env node
// The resumable lesson→video generation loop.
//
//   node scripts/pipeline/orchestrate.mjs <mode> [args]
//
// Modes:
//   inspect              Read-only: show the plan, sources, and per-lesson status.
//   validate <id|final>  Run the deterministic gates against what already exists (no cost).
//   dry-run  <id>        Walk every step, describe what WOULD run, generate nothing.
//   one      <id>        Generate + render + validate a single lesson (COSTS API $).
//   range    <a> <b>     Same, for a lesson-number range.
//   resume               Continue every lesson not yet 'completed'/'approved' (COSTS $).
//   repair   <id>        Re-run only the failed sections of one lesson (COSTS $).
//   status   [id]        Print the persistent queue/status.
//   approve  <id>        Human sign-off gate: mark a passing lesson 'approved' for publish.
//
// Generation steps SHELL OUT to the proven METHOD scripts (author-from-excel →
// gate-a → images(registry/generate/approve) → build-method-lesson → remotion
// render Lesson-01-Method → normalize → still). This script owns orchestration,
// validation (Gate A + Gate B), retries, resumability, policies, and reporting.
//
// SAFETY: costly modes (one/range/resume/repair) require --yes, or they stop and
// print the cost estimate. Nothing publishes to YouTube — 'approve' is the human gate.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT, REMOTION, DIRS, run, loadConfig, readStatus, writeStatus, allStatuses,
  log, withRetry, writeManifest, writeReport, hashFiles, nowISO,
} from './lib.mjs';
import * as V from './validate.mjs';
import { normalizeLoudness } from './normalize.mjs';
import { buildBundle } from './bundle.mjs';
import { copyFile, mkdir } from 'node:fs/promises';

const argv = process.argv.slice(2);
const mode = argv[0] || 'inspect';
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const pos = argv.slice(1).filter((a) => !a.startsWith('--'));
const YES = flags.has('--yes');

// ---- lesson registry: everything the loop needs to know about a lesson ------
// lesson-01 is concrete today; others follow the same path convention and are
// gated on their source existing (never fabricated).
function lessonRef(num) {
  const id = `lesson-${String(num).padStart(2, '0')}`;
  return {
    id, num,
    workbook: `curriculum/${id}.xlsx`,             // authoritative Excel source (the Method input)
    transcript: `lessons/${id}.md`,                // author-from-excel output (Method grammar)
    lessonJson: `src/data/lessons/${id}.method.json`,
    composition: 'Lesson-01-Method',              // any Method lesson renders here (calculateMetadata)
    videoPath: `out/films/${id}-method-final.mp4`,
    coverPath: `public/assets/covers/${id}.png`,
  };
}
// 'Lesson-01-Method' has calculateMetadata (Root.tsx), so passing a baked Method
// lesson JSON via --props renders it at its OWN length — any lesson, any duration.

async function discoverLessons() {
  // A lesson is in play once its Excel workbook OR an authored transcript exists on
  // disk. Never fabricated — no source, not discovered.
  const found = [];
  for (let n = 1; n <= 30; n++) {
    const r = lessonRef(n);
    if (existsSync(path.join(ROOT, r.workbook)) || existsSync(path.join(ROOT, r.transcript))) found.push(r);
  }
  return found;
}

// imageApproval=auto: the locked style is trusted, so mark every freshly-generated
// registry image 'approved' (I-11) instead of stopping at a human contact sheet.
async function approveImages() {
  const regPath = path.join(ROOT, 'assets/images/registry.json');
  if (!existsSync(regPath)) return 0;
  const reg = JSON.parse(await readFile(path.join(ROOT, 'assets/images/registry.json'), 'utf8'));
  let n = 0;
  for (const grp of ['items', 'scenes']) for (const e of Object.values(reg[grp] || {})) if (e.status === 'generated') { e.status = 'approved'; e.approved_at = nowISO(); n++; }
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(path.join(ROOT, 'assets/images/registry.json'), JSON.stringify(reg, null, 2) + '\n');
  return n;
}

// =============================== validation ================================
async function runValidations(ref, cfg, { final }) {
  const checks = [];
  const hasTranscript = existsSync(path.join(ROOT, ref.transcript));
  checks.push(hasTranscript
    ? { name: 'sourceValid', ok: true, status: 'pass', hardGate: true, detail: ref.transcript }
    : { name: 'sourceValid', ok: false, status: 'needs-review', hardGate: true, detail: `no transcript ${ref.transcript}` });
  if (final) {
    // Technical gates (probe the real file) + the Method two-gate QA (A refresh + B on the render).
    checks.push(...await V.validateFinal({ videoPath: ref.videoPath }, cfg));
    checks.push(...await V.validateMethodGateB({ id: ref.id, videoPath: ref.videoPath }, cfg));
  } else if (hasTranscript) {
    // No render yet — run Gate A alone so `validate` still reports pre-render blocks.
    const ga = await run('node', ['scripts/qa/gate-a.mjs', ref.id]);
    checks.push(ga.code === 0
      ? { name: 'gateA', ok: true, status: 'pass', hardGate: true, detail: 'no blocks' }
      : { name: 'gateA', ok: false, status: 'fail', hardGate: true, detail: `Gate A blocks — see qa/${ref.id}.json` });
  }
  return checks;
}

function printChecks(checks) {
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '⚠';
    const gate = c.hardGate ? ' [gate]' : '';
    console.log(`  ${icon} ${c.name}${gate}: ${c.detail}`);
    if (c.detail2?.length) console.log(`      ${JSON.stringify(c.detail2)}`);
  }
}

async function validateLesson(ref, cfg, { final }) {
  const checks = await runValidations(ref, cfg, { final });
  const summary = V.summarize(checks);
  printChecks(checks);
  console.log(`\n  → ${summary.status.toUpperCase()}  (${summary.hardGatesPassed}/${summary.hardGatesTotal} hard gates)`);
  if (summary.failed.length) console.log(`    failed: ${summary.failed.join(', ')}`);
  if (summary.needsReview.length) console.log(`    needs-review: ${summary.needsReview.join(', ')}`);
  const report = { lessonId: ref.id, at: nowISO(), summary, checks };
  await writeReport(ref.id, report);
  return report;
}

// =============================== generation ================================
// Each step returns {ok, detail}. Real cost lives here; guarded by dry/YES.
async function step(name, fn, { dry }) {
  if (dry) { console.log(`  ○ DRY ${name}`); return { ok: true, dry: true }; }
  const r = await fn();
  console.log(`  ${r.ok ? '✓' : '✗'} ${name}${r.detail ? ' — ' + r.detail : ''}`);
  return r;
}

async function generateLesson(ref, cfg, { dry }) {
  const setStatus = (patch) => (dry ? null : writeStatus(ref.id, patch));
  const strict = (cfg.method?.imageApproval || 'auto') === 'auto';
  await setStatus({ status: 'planning' });

  // 1. Excel → Method-grammar transcript (deterministic, no API). If there's no
  //    workbook but a transcript already exists (hand-authored / prior run), use it.
  await step('author transcript from Excel', async () => {
    const hasWb = existsSync(path.join(ROOT, ref.workbook));
    if (!hasWb) {
      if (existsSync(path.join(ROOT, ref.transcript))) return { ok: true, detail: 'no workbook — using existing transcript' };
      throw new Error(`no source: neither ${ref.workbook} nor ${ref.transcript}`);
    }
    const r = await run('node', ['scripts/author-from-excel.mjs', ref.workbook]);
    return { ok: r.code === 0, detail: r.code === 0 ? 'authored' : r.stderr.trim() };
  }, { dry });

  // 2. GATE A (pre-render) — the 77-rule registry via say_it_qc. A BLOCK is a real
  //    source problem; the curriculum is authoritative, so we HALT (never fabricate).
  //    WARNs are logged by Gate B validation, not blocking (config.method.warnPolicy).
  await step('gate A (pre-render, 77 rules)', async () => {
    const r = await run('node', ['scripts/qa/gate-a.mjs', ref.id]);
    if (r.code !== 0) throw new Error(`Gate A BLOCK — see qa/${ref.id}.json (halting to needs-review)`);
    return { ok: true, detail: 'no blocks' };
  }, { dry });

  // 3. images — registry from the workbook → generate the LOCKED style (scene briefs
  //    come from the Excel image_brief column; a stub trips the ≥8-word guard and
  //    surfaces as a failure) → AUTO-APPROVE (imageApproval=auto). Known items (I-10)
  //    are reused, so usually only new items + this lesson's scenes generate.
  await setStatus({ status: 'generating-images' });
  await step('images (registry → generate → approve)', () => withRetry(async () => {
    const reg = await run('node', ['scripts/images/registry.mjs', ref.workbook]);
    if (reg.code !== 0) throw new Error('registry: ' + reg.stderr.trim());
    const gen = await run('node', ['--env-file=.env', 'scripts/images/generate.mjs']);
    if (gen.code !== 0) throw new Error('generate: ' + (gen.stderr.trim().split('\n').slice(-2).join(' ') || gen.stdout.trim().split('\n').slice(-2).join(' ')));
    const approved = strict ? await approveImages() : 0;
    return { ok: true, detail: strict ? `generated + ${approved} approved` : 'generated (awaiting human approval)' };
  }, { tries: cfg.retries.perAsset, ...cfg.retries }, (i, e, d) => log(ref.id, 'retry-images', { i, msg: e.message, backoffMs: d })), { dry });

  // 4. audio + bake timeline (COSTS ElevenLabs $; disk-cached clips reused) → .method.json.
  //    SAYIT_IMAGES_STRICT ties the bake to approved-only images (I-11) when auto-approving.
  await setStatus({ status: 'generating-audio' });
  await step('build audio + timeline (method)', () => withRetry(async () => {
    const r = await run('node', ['--env-file=.env', 'scripts/build-method-lesson.mjs', ref.id],
      { env: { ...process.env, SAYIT_IMAGES_STRICT: strict ? '1' : '0' } });
    if (r.code !== 0) throw new Error(r.stderr.trim().split('\n').slice(-2).join(' ') || 'build-method-lesson failed');
    return { ok: true, detail: 'baked' };
  }, { tries: cfg.retries.perAsset, ...cfg.retries }, (i, e, d) => log(ref.id, 'retry-audio', { i, msg: e.message, backoffMs: d })), { dry });

  // 5. render 4K (CPU-heavy) — the baked Method lesson JSON as props → raw file
  await setStatus({ status: 'rendering' });
  const rawPath = ref.videoPath.replace(/\.mp4$/, '.raw.mp4');
  await step('render video (4K)', () => withRetry(async () => {
    const r = await run(REMOTION, ['render', 'src/index.ts', ref.composition, rawPath,
      `--props=${JSON.stringify({ lesson: JSON.parse(await readFile(path.join(ROOT, ref.lessonJson), 'utf8')) })}`]);
    if (r.code !== 0) throw new Error(r.stderr.trim().split('\n').slice(-3).join(' '));
    return { ok: true, detail: rawPath };
  }, { tries: cfg.retries.perLesson, ...cfg.retries }, (i, e) => log(ref.id, 'retry-render', { i, msg: e.message })), { dry });

  // 5b. normalize loudness to the target LUFS → the final file (audio-only re-encode)
  await step('normalize loudness', async () => {
    const { before, target } = await normalizeLoudness(path.join(ROOT, rawPath), path.join(ROOT, ref.videoPath), cfg);
    return { ok: true, detail: `${before} → ${target} LUFS` };
  }, { dry });

  // 6. thumbnail (cheap still)
  await step('render thumbnail', async () => {
    const r = await run(REMOTION, ['still', 'src/index.ts', 'Thumbnail', ref.coverPath]);
    return { ok: r.code === 0, detail: r.code === 0 ? ref.coverPath : r.stderr.trim() };
  }, { dry });
}

// bounded generate → validate → repair loop
async function processLesson(ref, cfg, { dry }) {
  console.log(`\n━━ ${ref.id} ━━`);
  const setStatus = (patch) => (dry ? null : writeStatus(ref.id, patch));
  if (dry) { await generateLesson(ref, cfg, { dry }); console.log('  (dry-run: skipping validation of unbuilt output)'); return { ref, dry: true }; }
  await writeStatus(ref.id, { attempts: ((await readStatus(ref.id))?.attempts || 0) });
  let report;
  for (let attempt = 1; attempt <= cfg.retries.perLesson + 1; attempt++) {
    await setStatus({ status: attempt === 1 ? 'generating-audio' : 'repairing', attempts: attempt });
    await generateLesson(ref, cfg, { dry });
    report = await validateLesson(ref, cfg, { final: true });
    if (report.summary.status === 'pass') {
      // All hard gates pass. Surface non-blocking WARNs (warnPolicy=proceed-report)
      // as 'completed-with-warnings' so they're visible in status without stopping.
      const wc = report.checks.find((c) => c.name === 'methodWarnings');
      const withWarns = wc && /\d+ WARN/.test(wc.detail || '') && !/no warnings/.test(wc.detail || '');
      await writeStatus(ref.id, { status: withWarns ? 'completed-with-warnings' : 'completed' });
      if (!flags.has('--no-publish')) await publishLesson(ref, { dry: false }).catch((e) => console.log('  ⚠ publish error:', e.message));
      break;
    }
    if (report.summary.status === 'needs-review') { await writeStatus(ref.id, { status: 'needs-review' }); break; }
    log(ref.id, 'attempt-failed', { attempt, failed: report.summary.failed });
    if (attempt > cfg.retries.perLesson) { await writeStatus(ref.id, { status: 'needs-review', reason: 'retries exhausted' }); }
  }
  await writeManifest(ref.id, {
    lessonId: ref.id, generatedAt: nowISO(), sources: { workbook: ref.workbook, transcript: ref.transcript },
    sourceHash: await hashFiles([ref.workbook, ref.transcript]),
    outputs: { video: ref.videoPath, cover: ref.coverPath, lessonJson: ref.lessonJson },
    report: `pipeline/reports/${ref.id}.report.json`,
    finalStatus: (await readStatus(ref.id))?.status,
  });
  return { ref, report };
}

// ---- publish: package the reloadable project + video, upload to Google Drive -
// The pipeline is a plain Node script, so it can't use the session's Drive MCP
// tools. Autonomous upload therefore goes through rclone (same pattern as the
// existing OneDrive path). Configure once:
//   rclone config           # create a remote named "gdrive" (Google Drive, OAuth)
//   export SAYIT_GDRIVE_REMOTE=gdrive
//   export SAYIT_GDRIVE_BASE="ClaudeAI/Youtube/French"   # optional; this is the default
// Without a remote we still BUILD the bundle + stage the video locally and print
// exactly what to upload — nothing is silently skipped.
async function publishLesson(ref, { dry }) {
  console.log(`\n── publish ${ref.id} ──`);
  if (dry) { console.log('  ○ DRY would build project bundle + upload video/bundle to Drive'); return { dry: true }; }

  const bundle = await buildBundle(ref.id);
  const stageDir = path.join(ROOT, 'pipeline/publish', ref.id);
  const videoAbs = path.join(ROOT, ref.videoPath);
  let stagedVideo = null;
  if (existsSync(videoAbs)) {
    stagedVideo = path.join('pipeline/publish', ref.id, `${ref.id}-fr-final.mp4`);
    await copyFile(videoAbs, path.join(ROOT, stagedVideo));
  }
  console.log(`  ✓ bundle: ${bundle.zipRel} (${bundle.fileCount} files)`);
  console.log(`  ✓ staged: ${stageDir.replace(ROOT + '/', '')}${stagedVideo ? ' (incl. video)' : ' (video not rendered yet)'}`);

  const remote = process.env.SAYIT_GDRIVE_REMOTE;
  const base = process.env.SAYIT_GDRIVE_BASE || 'ClaudeAI/Youtube/French';
  // Resolve rclone robustly — $RCLONE_BIN, then PATH, then the stable ~/.local/bin
  // copy (survives nvm switching node versions). All read the same ~/.config/rclone.
  const rcloneBin = await resolveRclone();
  if (!remote || !rcloneBin) {
    console.log(`\n  ⚠ Upload skipped — ${!rcloneBin ? 'rclone not found' : 'SAYIT_GDRIVE_REMOTE not set'}.`);
    console.log(`    Everything to upload is staged in ${stageDir.replace(ROOT + '/', '')}.`);
    console.log(`    Enable auto-upload: "rclone config" a Google Drive remote, then set SAYIT_GDRIVE_REMOTE=gdrive.`);
    return { uploaded: false, staged: stageDir };
  }
  const dest = `${remote}:${base}/${ref.id}`;
  const up = await run(rcloneBin, ['copy', stageDir, dest, '--drive-chunk-size', '64M', '-q']);
  if (up.code !== 0) { console.log(`  ✗ rclone upload failed: ${up.stderr.trim().slice(-200)}`); return { uploaded: false, error: up.stderr.trim() }; }
  console.log(`  ✓ uploaded → ${dest} (video + ${ref.id}-project.zip + manifest)`);
  return { uploaded: true, dest };
}

// Find a usable rclone: $RCLONE_BIN → on PATH → the stable ~/.local/bin copy.
async function resolveRclone() {
  if (process.env.RCLONE_BIN && existsSync(process.env.RCLONE_BIN)) return process.env.RCLONE_BIN;
  const w = await run('which', ['rclone']);
  if (w.code === 0 && w.stdout.trim()) return w.stdout.trim();
  const home = process.env.HOME || '';
  const local = path.join(home, '.local/bin/rclone');
  return existsSync(local) ? local : null;
}

function costGuard(action) {
  if (YES) return true;
  console.log(`\n⚠ "${action}" will call ElevenLabs + Recraft and run a multi-minute render (real $).`);
  console.log(`  Re-run with --yes to proceed. Nothing was generated.`);
  return false;
}

// ================================= modes ===================================
async function main() {
  const cfg = await loadConfig();
  const lessons = await discoverLessons();

  if (mode === 'inspect') {
    console.log(`\nSay It — lesson→video loop  (pipeline config v${cfg.version})`);
    console.log(`Gates: duration ${cfg.duration.minSeconds}-${cfg.duration.maxSeconds}s · ${cfg.video.width}x${cfg.video.height}@${cfg.video.fps} · ${cfg.video.vcodec}/${cfg.video.acodec} · loudness ${cfg.loudness.targetLufs}±${cfg.loudness.toleranceLufs} LUFS · sync ±${cfg.sync.toleranceSeconds}s`);
    console.log(`Pronunciation gate: ${cfg.pronunciation.enabled ? cfg.pronunciation.engine : 'DISABLED → needs-review (honest: unverified)'}`);
    console.log(`\nDiscovered ${lessons.length} lesson source(s):`);
    for (const r of lessons) {
      const st = await readStatus(r.id);
      const src = existsSync(path.join(ROOT, r.workbook)) ? 'excel' : 'transcript';
      console.log(`  · ${r.id}  [${src}]  status=${st?.status || 'unstarted'}  video=${existsSync(path.join(ROOT, r.videoPath)) ? 'present' : '—'}`);
    }
    console.log(`\nModes: validate <id> · dry-run <id> · one <id> --yes · range <a> <b> --yes · resume --yes · repair <id> --yes · publish <id> · status · approve <id>\n`);
    return;
  }

  if (mode === 'status') {
    const all = pos[0] ? [await readStatus(pos[0])].filter(Boolean) : await allStatuses();
    if (!all.length) { console.log('No lessons started yet.'); return; }
    for (const s of all) console.log(`  ${s.lessonId.padEnd(12)} ${String(s.status).padEnd(16)} attempts=${s.attempts}  updated=${s.updatedAt || '—'}`);
    return;
  }

  if (mode === 'validate') {
    const target = pos[0] || lessons[0]?.id;
    const ref = lessons.find((l) => l.id === target) || lessonRef(Number(String(target).replace(/\D/g, '')) || 1);
    const final = !flags.has('--no-final') && existsSync(path.join(ROOT, ref.videoPath));
    console.log(`\nValidating ${ref.id}${final ? ' (incl. rendered output)' : ' (source/assets only — no render found)'}:\n`);
    await validateLesson(ref, cfg, { final });
    return;
  }

  if (mode === 'dry-run') {
    const ref = lessonRef(Number(String(pos[0] || '1').replace(/\D/g, '')) || 1);
    console.log(`\nDRY-RUN ${ref.id} — steps that WOULD run (no generation):`);
    await processLesson(ref, cfg, { dry: true });
    console.log(`\nSource expected:\n  ${ref.workbook}  →  ${ref.transcript}  →  ${ref.lessonJson}\nOutputs:\n  ${ref.videoPath}\n  ${ref.coverPath}\n`);
    return;
  }

  if (mode === 'preview') {
    const ref = lessonRef(Number(String(pos[0] || '1').replace(/\D/g, '')) || 1);
    const scale = (argv.find((a) => a.startsWith('--scale=')) || '--scale=0.25');
    const out = `out/films/${ref.id}-preview.mp4`;
    console.log(`\nFast preview of ${ref.id} — ${scale.replace('--scale=', '')}× resolution, 2 Mbps (quick, low-cost). Checks text/audio/timing before the full 4K.`);
    console.log(`Rendering → ${out} …`);
    const t0 = Date.now();
    // --video-bitrate overrides the config's high VBR (can't use --crf alongside it).
    const r = await run(REMOTION, ['render', 'src/index.ts', ref.composition, out,
      `--props=${JSON.stringify({ lesson: JSON.parse(await readFile(path.join(ROOT, ref.lessonJson), 'utf8')) })}`,
      scale, '--video-bitrate=2M']);
    if (r.code !== 0) { console.error('✗ preview failed:', r.stderr.trim().split('\n').slice(-3).join(' ')); process.exit(1); }
    console.log(`✓ preview ready in ${Math.round((Date.now() - t0) / 1000)}s → ${out}\n  Review it, then run the full 4K with:  npm run lessons -- one ${ref.num} --yes`);
    return;
  }

  if (mode === 'one') {
    if (!costGuard(`generate ${pos[0]}`)) return;
    const ref = lessonRef(Number(String(pos[0] || '1').replace(/\D/g, '')) || 1);
    await processLesson(ref, cfg, { dry: false });
    return;
  }

  if (mode === 'range') {
    const [a, b] = [Number(pos[0]), Number(pos[1])];
    if (!a || !b) { console.error('Usage: range <a> <b> --yes'); process.exit(1); }
    if (!costGuard(`generate lessons ${a}–${b}`)) return;
    for (let n = a; n <= b; n++) {
      const ref = lessonRef(n);
      if (!existsSync(path.join(ROOT, ref.workbook)) && !existsSync(path.join(ROOT, ref.transcript))) { console.log(`  skip ${ref.id} (no source)`); continue; }
      const res = await processLesson(ref, cfg, { dry: false });
      if (cfg.failurePolicy !== 'continue' && res.report?.summary.status === 'fail') break;
    }
    return;
  }

  if (mode === 'resume') {
    const pending = [];
    for (const r of lessons) {
      const st = await readStatus(r.id);
      if (!st || !['completed', 'completed-with-warnings', 'approved'].includes(st.status)) pending.push(r);
    }
    if (!pending.length) { console.log('Nothing to resume — all discovered lessons are completed/approved.'); return; }
    console.log(`Resuming ${pending.length}: ${pending.map((r) => r.id).join(', ')}`);
    if (!costGuard('resume pending lessons')) return;
    for (const r of pending) await processLesson(r, cfg, { dry: false });
    return;
  }

  if (mode === 'repair') {
    const ref = lessonRef(Number(String(pos[0] || '1').replace(/\D/g, '')) || 1);
    console.log(`\nRepairing ${ref.id} — validating first to target only failed sections:`);
    const before = await validateLesson(ref, cfg, { final: existsSync(path.join(ROOT, ref.videoPath)) });
    if (before.summary.status === 'pass') { console.log('\nAlready passing — nothing to repair.'); return; }
    if (!costGuard(`repair ${ref.id} (${before.summary.failed.join(', ') || 'needs-review items'})`)) return;
    await processLesson(ref, cfg, { dry: false });
    return;
  }

  if (mode === 'publish') {
    const ref = lessonRef(Number(String(pos[0] || '1').replace(/\D/g, '')) || 1);
    console.log(`\nPublishing ${ref.id} — building reloadable project bundle + staging video for Google Drive:`);
    await publishLesson(ref, { dry: flags.has('--dry-run') });
    return;
  }

  if (mode === 'approve') {
    const ref = lessonRef(Number(String(pos[0] || '').replace(/\D/g, '')) || 0);
    const st = await readStatus(ref.id);
    if (!st) { console.error(`No status for ${ref.id}.`); process.exit(1); }
    if (!['completed', 'completed-with-warnings'].includes(st.status)) { console.error(`${ref.id} is '${st.status}', not completed. Only a fully-passing lesson can be approved.`); process.exit(1); }
    await writeStatus(ref.id, { status: 'approved', approvedAt: nowISO() });
    console.log(`✓ ${ref.id} approved for publish. (Publishing itself remains a manual, human step — this loop never uploads to YouTube.)`);
    return;
  }

  console.error(`Unknown mode: ${mode}\nRun: node scripts/pipeline/orchestrate.mjs inspect`);
  process.exit(1);
}

main().catch((e) => { console.error('\n✗ orchestrator error:', e.message); process.exit(1); });
