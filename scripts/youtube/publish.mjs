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

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildMetadata, fmtTime } from './metadata.mjs';
import { writeCaptions } from './captions.mjs';
import { loadLesson } from './lesson.mjs';
import { resolveLinksForLesson } from './series.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Chapter times come from timing.mjs, which replays the renderer's frame maths.
// They used to be derived from the build manifest's `videoStart`, which
// accumulates in seconds against a stale 4.5s intro and drifts up to ~2.5s by
// the end of a lesson — every chapter after the first was mistimed.

function parseArgs(argv) {
  const args = { privacy: 'private', dryRun: false, skipQc: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--lang': args.lang = next(); break;
      case '--lesson': args.lesson = Number(next()); break;
      case '--id': args.id = next(); break; // explicit lesson id (loop passes the workbook basename)
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

function loadResolvedLesson(args) {
  let loaded;
  try {
    // Links are resolved from the series ledger so a lesson published today
    // links to the one published yesterday (see series.mjs).
    loaded = loadLesson({
      lang: args.lang,
      lesson: args.lesson,
      id: args.id,
      links: resolveLinksForLesson(args.lang, args.lesson),
    });
  } catch (e) {
    fail((e && e.message) || String(e));
  }

  // Translated title/description per viewer UI language, if they have been
  // generated (scripts/youtube/localize.mjs). Optional — absence is normal.
  const locPath = path.join(REPO_ROOT, 'out', args.lang, loaded.P.id, 'localizations.json');
  if (existsSync(locPath)) {
    try {
      const localizations = readJson(locPath);
      if (localizations && Object.keys(localizations).length) {
        loaded.localizations = localizations;
      }
    } catch (e) {
      console.warn(`⚠ ignoring unreadable ${path.relative(REPO_ROOT, locPath)}: ${e.message}`);
    }
  }

  // Overrides file (optional) merged LAST inside buildMetadata.
  let overrides = {};
  if (args.metadata) {
    const op = path.isAbsolute(args.metadata) ? args.metadata : path.join(REPO_ROOT, args.metadata);
    if (!existsSync(op)) fail(`--metadata file not found: ${op}`);
    overrides = readJson(op);
  }

  return { ...loaded, overrides };
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

  const locales = Object.keys(resource.localizations || {});
  if (locales.length) {
    console.log(`\nLOCALIZATIONS (${locales.length}) — served by the viewer's UI language:`);
    for (const l of locales) {
      console.log(`  ${l}: ${resource.localizations[l].title}`);
    }
  }

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

  const { P, lesson, seoConfig, overrides, meta, localizations } = loadResolvedLesson(args);

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
    if (localizations) resource.localizations = localizations;
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

  // Captions are generated here, not assumed. They are the highest-value search
  // signal we produce (see docs/youtube-seo-spec.md) and writeCaptions refuses to
  // emit a track whose cues would leak into a retrieval gap.
  let srtPath = path.join(outDir, 'captions.en.srt');
  try {
    const cap = writeCaptions({ id: P.id, lang: args.lang, repoRoot: REPO_ROOT, outDir });
    srtPath = cap.srtPath;
    console.log(
      `  captions built: ${cap.stats.cues} cues, ${cap.stats.targetLangCues} in ${args.lang}, ` +
      `${cap.stats.characters} indexable chars`
    );
  } catch (e) {
    console.warn(`  ⚠ caption generation failed — uploading without captions: ${(e && e.message) || e}`);
  }
  const capEn = await insertCaptions(auth, videoId, srtPath, 'en', 'English');
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
