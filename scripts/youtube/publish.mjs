// publish.mjs — CLI orchestrator for the Mosaic → YouTube uploader.
//
// Usage:
//   node scripts/youtube/publish.mjs --lang fr --lesson 1 --dry-run
//   node scripts/youtube/publish.mjs --lang fr --lesson 1 [--privacy private]
//       [--schedule 2026-08-01T14:00] [--metadata path/to/overrides.json] [--skip-qc]
//
// --dry-run prints the COMPLETE resolved metadata and makes ZERO API calls and
// needs NO credentials. Default --privacy is "private" (public must be typed).
// Exits non-zero on any failure so CI can gate on it.

import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildMetadata, fmtTime } from './metadata.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Intro-offset correction (see src/deck/IntroVideo.tsx INTRO_VIDEO_FRAMES=308@30fps).
// The manifest's videoStart uses a stale 4.5s intro; the real rendered intro is
// 308/30 = 10.2667s. real = videoStart - STALE_INTRO + REAL_INTRO.
const STALE_INTRO = 4.5;
const REAL_INTRO = 308 / 30;

const STAGE_TITLES = {
  CAN_DO_GOAL: 'Your goal',
  WARM_UP: 'Warm-up',
  COLD_INPUT: 'Listen',
  ITEM_BLOCK: 'Meet the words',
  MICRO_RECALL: 'Quick check',
  FRAME_INTRO: 'Build a sentence',
  BUILD_LADDER: 'Build it',
  INPUT_RETURN: 'Listen again',
  MAKE_IT_YOURS: 'Make it yours',
  TRANSFER_TASK: 'Your turn',
  FLUENCY_ROUND: 'Fluency',
  CAN_DO_CHECK: 'Recap',
};

function two(n) {
  return String(n).padStart(2, '0');
}

function parseArgs(argv) {
  const args = { privacy: 'private', dryRun: false, skipQc: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--lang': args.lang = next(); break;
      case '--lesson': args.lesson = Number(next()); break;
      case '--privacy': args.privacy = next(); break;
      case '--schedule': args.schedule = next(); break;
      case '--metadata': args.metadata = next(); break;
      case '--dry-run': args.dryRun = true; break;
      case '--paste': args.paste = true; break; // write out/<id>-youtube.txt (copy-paste for manual upload)
      case '--skip-qc': args.skipQc = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// Derive chapters from the build manifest, applying the intro-offset fix and
// enforcing YouTube's chapter rules (first at 0, >=3, each >=10s apart, ascending).
function deriveChapters(manifest) {
  const lines = manifest.lines || [];
  const firstByStage = [];
  const seen = new Set();
  for (const l of lines) {
    if (!seen.has(l.stage)) {
      seen.add(l.stage);
      firstByStage.push({ stage: l.stage, videoStart: l.videoStart });
    }
  }

  // Map to real times.
  const mapped = firstByStage.map((s) => ({
    title: STAGE_TITLES[s.stage] || s.stage,
    start: s.videoStart - STALE_INTRO + REAL_INTRO,
  }));

  // Prepend the brand Intro (0 -> 10.2667s).
  const withIntro = [{ title: 'Intro', start: 0 }, ...mapped];

  // Enforce >=10s ascending: keep a chapter only if it is >=10s after the last
  // kept one. Drops (merges) violators — e.g. BUILD_LADDER right after FRAME_INTRO.
  const kept = [];
  for (const c of withIntro) {
    if (kept.length === 0) {
      kept.push(c);
      continue;
    }
    const last = kept[kept.length - 1];
    if (c.start - last.start >= 10) kept.push(c);
  }
  return kept;
}

function buildWords(meta, registry) {
  const items = registry.items || {};
  return meta.items.map((w) => {
    const entry = items[w];
    const gloss = entry && entry.gloss ? entry.gloss : w;
    return { word: w, gloss };
  });
}

function resolveInputs(lang, lesson) {
  const id = `lesson-${two(lesson)}`;
  const paths = {
    id,
    methodJson: path.join(REPO_ROOT, 'src', 'data', 'lessons', `${id}.method.json`),
    manifest: path.join(REPO_ROOT, 'build', id, 'manifest.json'),
    registry: path.join(REPO_ROOT, 'assets', 'images', 'registry.json'),
    channels: path.join(REPO_ROOT, 'config', 'channels.json'),
    video: path.join(REPO_ROOT, 'out', `${id}-method-540p-norm.mp4`),
    thumbnail: path.join(REPO_ROOT, 'out', 'thumbnails', `${id}.png`),
    transcript: path.join(REPO_ROOT, 'lessons', `${id}.md`),
  };
  return paths;
}

function loadResolvedLesson(args) {
  const P = resolveInputs(args.lang, args.lesson);

  if (!existsSync(P.methodJson)) fail(`Lesson JSON missing: ${P.methodJson}`);
  if (!existsSync(P.manifest)) fail(`Build manifest missing (needed for chapters): ${P.manifest}`);
  if (!existsSync(P.channels)) fail(`Channel config missing: ${P.channels}`);
  if (!existsSync(P.registry)) fail(`Image registry missing (needed for glosses): ${P.registry}`);

  const method = readJson(P.methodJson);
  const meta = method.meta;
  if (!meta || !Array.isArray(meta.items)) fail('Lesson JSON has no meta.items');

  const channels = readJson(P.channels);
  const seoConfig = channels[args.lang];
  if (!seoConfig) fail(`No channel config for lang "${args.lang}" in config/channels.json`);

  const registry = readJson(P.registry);
  const manifest = readJson(P.manifest);

  const chapters = deriveChapters(manifest);
  const words = buildWords(meta, registry);

  // recordingDate = render date (video mtime if present, else today).
  let recordingDate = new Date();
  if (existsSync(P.video)) recordingDate = statSync(P.video).mtime;

  const lesson = {
    meta,
    chapters,
    words,
    recordingDate: recordingDate.toISOString(),
    links: {}, // playlist/next/prev filled by overrides or later publishing steps
  };

  // Overrides file (optional) merged LAST inside buildMetadata.
  let overrides = {};
  if (args.metadata) {
    const op = path.isAbsolute(args.metadata) ? args.metadata : path.join(REPO_ROOT, args.metadata);
    if (!existsSync(op)) fail(`--metadata file not found: ${op}`);
    overrides = readJson(op);
  }

  return { P, lesson, seoConfig, overrides, meta };
}

function printDryRun(resource, lesson) {
  const { snippet } = resource;
  const desc = snippet.description;
  const tagChars = (snippet.tags || []).join('').length;
  const line = '─'.repeat(72);

  console.log('\n' + line);
  console.log('DRY RUN — resolved metadata (no API calls, no credentials used)');
  console.log(line);

  console.log(`\nTITLE (${snippet.title.length}/100 chars):`);
  console.log('  ' + snippet.title);

  console.log('\nDESCRIPTION — first 150 chars (search / above-the-fold):');
  console.log('  ' + JSON.stringify(desc.slice(0, 150)));

  console.log(`\nDESCRIPTION — full (${desc.length}/5000 chars):`);
  console.log(desc.split('\n').map((l) => '  ' + l).join('\n'));

  console.log(`\nTAGS (${snippet.tags.length} tags, ${tagChars}/500 chars):`);
  console.log('  ' + snippet.tags.join(', '));

  console.log(`\nCHAPTERS (${lesson.chapters.length}):`);
  for (const c of lesson.chapters) console.log(`  ${fmtTime(c.start)}  ${c.title}`);

  console.log('\nSTRUCTURED FIELDS:');
  console.log(`  categoryId:              ${snippet.categoryId}`);
  console.log(`  defaultLanguage:         ${snippet.defaultLanguage}`);
  console.log(`  defaultAudioLanguage:    ${snippet.defaultAudioLanguage}`);
  console.log(`  privacyStatus:           ${resource.status.privacyStatus}`);
  console.log(`  selfDeclaredMadeForKids: ${resource.status.selfDeclaredMadeForKids}`);
  console.log(`  containsSyntheticMedia:  ${resource.status.containsSyntheticMedia}`);
  console.log(`  license:                 ${resource.status.license}`);
  console.log(`  embeddable:              ${resource.status.embeddable}`);
  console.log(`  recordingDate:           ${resource.recordingDetails.recordingDate}`);
  console.log('\n' + line + '\n');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail(e.message);
  }
  if (!args.lang) fail('--lang is required');
  if (!args.lesson || Number.isNaN(args.lesson)) fail('--lesson <n> is required');
  if (args.privacy === 'public') {
    fail('Refusing --privacy public. Upload is always private on insert; going live is a separate manual step.');
  }

  const { P, lesson, seoConfig, overrides, meta } = loadResolvedLesson(args);

  // Resolution note (current renders are 540p preview) — warn only, never fail.
  if (existsSync(P.video) && /540p/.test(P.video)) {
    console.warn(`⚠ Note: ${path.basename(P.video)} is a 540p preview render, not 4K. Proceeding (warn only).`);
  } else if (!existsSync(P.video)) {
    console.warn(`⚠ Note: rendered video not found at ${P.video} (fine for --dry-run).`);
  }

  // Build metadata (throws on any spec violation).
  let resource;
  try {
    resource = buildMetadata(lesson, overrides, seoConfig);
    resource.status.privacyStatus = args.privacy || 'private'; // never public (guarded above)
  } catch (e) {
    fail(`Metadata failed validation: ${e.message}`);
  }

  if (args.dryRun) {
    printDryRun(resource, lesson);
    console.log('✓ Dry run complete. Metadata is valid. No API calls were made.\n');
    process.exit(0);
  }

  // --paste: write a copy-paste-ready text file for MANUAL YouTube upload. No API
  // calls, no credentials. Title / full description (chapters + words baked in) / tags.
  if (args.paste) {
    const s = resource.snippet;
    const txt = [
      `Mosaic — ${P.id} · YouTube metadata (copy-paste for manual upload)`,
      '='.repeat(72), '',
      `TITLE  (${s.title.length}/100)`, '-'.repeat(40), s.title, '',
      'DESCRIPTION  (paste whole block — chapters give YouTube its timestamps)', '-'.repeat(40),
      s.description, '',
      `TAGS  (${s.tags.join(',').length}/500 · paste comma-separated)`, '-'.repeat(40),
      s.tags.join(', '), '',
      'FIELDS', '-'.repeat(40),
      `Category: Education (27)   ·   Made for kids: No   ·   Altered/synthetic content: Yes`,
      `Language: ${s.defaultLanguage}   ·   Privacy: unlisted/private until reviewed`, '',
    ].join('\n');
    const outTxt = path.join(REPO_ROOT, 'out', `${P.id}-youtube.txt`);
    mkdirSync(path.dirname(outTxt), { recursive: true });
    writeFileSync(outTxt, txt, 'utf8');
    console.log(`✓ wrote ${path.relative(REPO_ROOT, outTxt)}  (title ${s.title.length}/100, ${s.tags.length} tags)`);
    process.exit(0);
  }

  // ---- Live path (not exercised in dry-run / tests) -----------------------
  // QC gate (Stage 2) unless explicitly skipped.
  if (!args.skipQc) {
    const py = path.join(REPO_ROOT, '.venv-ocr', 'bin', 'python');
    const qc = path.join(REPO_ROOT, 'qa', 'mosaic_qc.py');
    const rules = path.join(REPO_ROOT, 'qa', 'mosaic_rules.yaml');
    if (!existsSync(P.transcript)) fail(`Transcript missing for QC: ${P.transcript}`);
    console.log('\nRunning QC gate...');
    const r = spawnSync(py, [qc, P.transcript, '--rules', rules], { stdio: 'inherit', cwd: REPO_ROOT });
    if (r.status !== 0) fail(`QC gate failed (exit ${r.status}). Stopping — QC is a gate, not a formality.`);
    console.log('✓ QC passed.');
  } else {
    console.warn('⚠ --skip-qc: QC gate bypassed by request.');
  }

  // Persist resolved metadata for the record.
  const outDir = path.join(REPO_ROOT, 'out', args.lang, P.id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(resource, null, 2) + '\n', 'utf8');

  if (!existsSync(P.video)) fail(`Rendered video required for upload: ${P.video}`);

  // Lazy-import network modules so the dry-run path never touches credentials.
  const { getClient } = await import('./auth.mjs');
  const { uploadVideo, findLogEntry } = await import('./upload.mjs');
  const { setThumbnail, insertCaptions, addToPlaylist } = await import('./assets.mjs');
  const { verifyVideo } = await import('./verify.mjs');

  let auth;
  try {
    auth = await getClient(args.lang);
  } catch (e) {
    fail(e.message);
  }

  const existing = findLogEntry(args.lang, args.lesson);
  if (existing && existing.videoId) {
    console.log(`Idempotency: lesson ${args.lesson} already uploaded as ${existing.videoId} — will UPDATE, not re-insert.`);
  }

  let uploadRes;
  try {
    uploadRes = await uploadVideo({
      lang: args.lang,
      lesson: args.lesson,
      id: P.id,
      videoPath: P.video,
      resource,
      auth,
    });
  } catch (e) {
    fail(`Upload failed: ${(e && e.message) || e}`);
  }
  const { videoId } = uploadRes;
  console.log(`\n✓ ${uploadRes.updated ? 'Updated' : 'Uploaded'} video: https://youtu.be/${videoId} (private)`);

  // Assets — tolerant of failure.
  const thumb = await setThumbnail(auth, videoId, P.thumbnail);
  console.log(`  thumbnail: ${thumb.ok ? 'set' : thumb.skipped ? 'skipped' : 'FAILED'}${thumb.error ? ' — ' + thumb.error : ''}`);

  // Captions optional — repo has no SRT yet; tolerate missing.
  const capEn = await insertCaptions(auth, videoId, path.join(outDir, 'captions.en.srt'), 'en', 'English');
  console.log(`  captions(en): ${capEn.ok ? 'set' : 'skipped'}${capEn.error ? ' — ' + capEn.error : ''}`);

  const playlistId = (seoConfig.playlists && seoConfig.playlists[meta.level]) || '';
  const pl = await addToPlaylist(auth, videoId, playlistId, args.lesson - 1);
  console.log(`  playlist: ${pl.ok ? 'added' : 'skipped'}${pl.error ? ' — ' + pl.error : ''}`);

  // Verify.
  console.log('\nVerifying processing state (this can take a while)...');
  const v = await verifyVideo(auth, videoId);
  console.log(`  state: ${v.state}${v.reason ? '\n  ' + v.reason : ''}`);
  if (v.state === 'rejected' || v.state === 'failed') {
    fail(`Video ${v.state}: ${v.reason}`);
  }

  console.log('\nManual steps the API cannot do: end screens & info cards, community post, pinned comment.');
  console.log('Going live is a separate, explicit step (see /publish Stage 7). Not done automatically.\n');
  process.exit(0);
}

main().catch((e) => fail((e && e.stack) || String(e)));
