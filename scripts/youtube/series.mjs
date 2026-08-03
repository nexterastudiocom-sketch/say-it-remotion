// series.mjs — the course as one object, not 50 unrelated uploads.
//
//   node scripts/youtube/series.mjs --lang fr --status
//   node scripts/youtube/series.mjs --lang fr --backfill [--dry-run] [--only 4]
//
// WHY
// docs/youtube-seo-spec.md ranks "suggested / next video" second only to search,
// and says a viewer who finishes lesson 3 and rolls into lesson 4 is worth more
// than a new impression. The description template has always had the slots:
//
//   ▶️ FULL FRENCH A1 COURSE: (playlist link — add once the course playlist is live)
//   ⏭️ NEXT: (add once the next lesson is published)
//   ⏮️ PREVIOUS: (add once the previous lesson is published)
//
// ...and every published lesson still carries that literal parenthetical, because
// filling them in is inherently retroactive: lesson 4's NEXT link cannot exist
// until lesson 5 is uploaded. Doing that by hand across a 50-lesson course is
// the kind of chore that never happens.
//
// This resolves the links from out/publish-log.json and re-pushes the affected
// descriptions. It is idempotent — a lesson whose description already matches is
// left alone, so a backfill costs quota only for what actually changed.
//
// NEXT/PREV links carry &list=<playlist>, so clicking one keeps the viewer inside
// the course playlist instead of dropping them into YouTube's general suggestions.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMetadata } from './metadata.mjs';
import { loadLesson, REPO_ROOT } from './lesson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- pure link resolution (unit-tested) ------------------------------------

export function watchUrl(videoId, playlistId = '') {
  if (!videoId) return '';
  return playlistId
    ? `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`
    : `https://youtu.be/${videoId}`;
}

export function playlistUrl(playlistId) {
  return playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : '';
}

/**
 * Build the per-lesson link set for a whole series.
 *
 * Ordering is by lesson number, and only lessons that actually have a videoId
 * count — an unpublished lesson 5 must not become lesson 4's NEXT, or the
 * description ships a dead link.
 *
 * @param {Array<{lesson:number, videoId:string}>} entries
 * @param {string} playlistId
 * @returns {Map<number, {playlist:string, next:string, prev:string}>}
 */
export function resolveSeriesLinks(entries, playlistId = '') {
  const published = (entries || [])
    .filter((e) => e && e.videoId)
    .map((e) => ({ lesson: Number(e.lesson), videoId: e.videoId }))
    .filter((e) => Number.isFinite(e.lesson))
    .sort((a, b) => a.lesson - b.lesson);

  const out = new Map();
  published.forEach((e, i) => {
    const prev = published[i - 1];
    const next = published[i + 1];
    out.set(e.lesson, {
      playlist: playlistUrl(playlistId),
      next: next ? watchUrl(next.videoId, playlistId) : '',
      prev: prev ? watchUrl(prev.videoId, playlistId) : '',
    });
  });
  return out;
}

/** Which lessons still show a placeholder instead of a real link. */
export function findStaleLinks(entries, playlistId = '') {
  const links = resolveSeriesLinks(entries, playlistId);
  const stale = [];
  for (const [lesson, l] of links) {
    const missing = [];
    if (!l.playlist) missing.push('playlist');
    // A first/last lesson legitimately has no prev/next; only flag a link that
    // exists in the series but is not yet reflected.
    if (!l.prev && links.has(lesson - 1)) missing.push('prev');
    if (!l.next && links.has(lesson + 1)) missing.push('next');
    if (missing.length) stale.push({ lesson, missing });
  }
  return stale;
}

// --- ledger ----------------------------------------------------------------

export function readPublishLog(repoRoot = REPO_ROOT) {
  const p = path.join(repoRoot, 'out', 'publish-log.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readChannelConfig(lang, repoRoot = REPO_ROOT) {
  const p = path.join(repoRoot, 'config', 'channels.json');
  if (!existsSync(p)) throw new Error(`Channel config missing: ${p}`);
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  if (!cfg[lang]) throw new Error(`No channel config for lang "${lang}"`);
  return cfg[lang];
}

/**
 * The links for ONE lesson — used by publish.mjs at upload time so a newly
 * published lesson ships with correct links immediately.
 * Never throws: link resolution must not be able to fail an upload.
 */
export function resolveLinksForLesson(lang, lesson, repoRoot = REPO_ROOT) {
  try {
    const cfg = readChannelConfig(lang, repoRoot);
    const level = 'A1';
    const playlistId = (cfg.playlists && (cfg.playlists[level] || Object.values(cfg.playlists)[0])) || '';
    const entries = readPublishLog(repoRoot).filter((e) => e.lang === lang);

    // Include this lesson even if it is not in the ledger yet (first upload),
    // so it still receives the playlist link and a PREV pointing at the last
    // published lesson.
    const withSelf = entries.some((e) => Number(e.lesson) === Number(lesson))
      ? entries
      : [...entries, { lesson: Number(lesson), videoId: '__self__' }];

    const links = resolveSeriesLinks(withSelf, playlistId);
    return links.get(Number(lesson)) || {};
  } catch {
    return {};
  }
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--lang': args.lang = next(); break;
      case '--status': args.status = true; break;
      case '--backfill': args.backfill = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--only': args.only = Number(next()); break;
      case '--level': args.level = next(); break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function seriesRows(lang, level) {
  const cfg = readChannelConfig(lang);
  const playlistId = (cfg.playlists && (cfg.playlists[level] || cfg.playlists.A1)) || '';
  const entries = readPublishLog().filter((e) => e.lang === lang && e.videoId);
  const links = resolveSeriesLinks(entries, playlistId);
  const rows = entries
    .map((e) => ({ ...e, lesson: Number(e.lesson), links: links.get(Number(e.lesson)) || {} }))
    .sort((a, b) => a.lesson - b.lesson);
  return { cfg, playlistId, rows };
}

function printStatus(lang, level) {
  const { playlistId, rows } = seriesRows(lang, level);
  const line = '─'.repeat(72);
  console.log('\n' + line);
  console.log(`Series: ${lang.toUpperCase()} ${level}`);
  console.log(line);
  console.log(`playlist: ${playlistUrl(playlistId) || '— not configured (run channels.mjs --connect)'}`);
  console.log(`published: ${rows.length} lesson(s)\n`);
  if (!rows.length) {
    console.log('Nothing published yet — out/publish-log.json is empty for this language.\n');
    return;
  }
  for (const r of rows) {
    console.log(
      `  #${String(r.lesson).padStart(2, '0')}  ${r.videoId}  ` +
      `prev:${r.links.prev ? '✓' : '—'} next:${r.links.next ? '✓' : '—'} playlist:${r.links.playlist ? '✓' : '—'}`
    );
  }
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].lesson !== rows[i - 1].lesson + 1) gaps.push(`${rows[i - 1].lesson}→${rows[i].lesson}`);
  }
  if (gaps.length) console.log(`\n⚠ gaps in the published sequence: ${gaps.join(', ')}`);
  console.log('');
}

async function backfill(args) {
  const level = args.level || 'A1';
  const { playlistId, rows } = seriesRows(args.lang, level);
  if (!rows.length) {
    console.log('Nothing published for this language — nothing to backfill.');
    return;
  }
  if (!playlistId) {
    console.warn('⚠ No playlist id configured; descriptions will still get NEXT/PREV but no course link.');
    console.warn('  Run: node scripts/youtube/channels.mjs --connect ' + args.lang);
  }

  const targets = args.only ? rows.filter((r) => r.lesson === args.only) : rows;
  if (!targets.length) {
    console.log(`Lesson ${args.only} is not in the publish log.`);
    return;
  }

  // Build the intended description for each target first, so --dry-run needs no
  // credentials at all.
  const planned = [];
  for (const r of targets) {
    try {
      const { lesson, seoConfig } = loadLesson({
        lang: args.lang, lesson: r.lesson, id: r.id, links: r.links,
      });
      const resource = buildMetadata(lesson, {}, seoConfig);
      planned.push({ row: r, resource });
    } catch (e) {
      console.warn(`  ⚠ #${r.lesson}: cannot rebuild metadata — ${(e && e.message) || e}`);
    }
  }

  if (args.dryRun) {
    console.log(`\nDRY RUN — ${planned.length} lesson(s) would be updated. No API calls.\n`);
    for (const p of planned) {
      const tail = p.resource.snippet.description.split('\n').filter((l) => /^[▶⏭⏮]/u.test(l));
      console.log(`  #${String(p.row.lesson).padStart(2, '0')} ${p.row.videoId}`);
      for (const t of tail) console.log(`      ${t}`);
    }
    console.log('');
    return;
  }

  const { getClient } = await import('./auth.mjs');
  const { google } = await import('googleapis');
  const auth = await getClient(args.lang);
  const youtube = google.youtube({ version: 'v3', auth });

  let updated = 0, skipped = 0, failed = 0;
  for (const p of planned) {
    const { row, resource } = p;
    try {
      // Read the live description first: re-pushing an identical one burns
      // quota and pointlessly bumps the video's edit history.
      const cur = await youtube.videos.list({ part: ['snippet'], id: [row.videoId] });
      const live = (cur.data.items || [])[0];
      if (!live) {
        console.warn(`  ⚠ #${row.lesson}: video ${row.videoId} not found on the channel`);
        failed++;
        continue;
      }
      if (live.snippet.description === resource.snippet.description) {
        skipped++;
        continue;
      }
      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: row.videoId,
          snippet: {
            ...live.snippet,
            description: resource.snippet.description,
            // categoryId and title are required on a snippet update.
            categoryId: live.snippet.categoryId || resource.snippet.categoryId,
            title: live.snippet.title || resource.snippet.title,
          },
        },
      });
      console.log(`  ✓ #${String(row.lesson).padStart(2, '0')} ${row.videoId} description updated`);
      updated++;
    } catch (e) {
      console.warn(`  ✗ #${row.lesson}: ${(e && e.message) || e}`);
      failed++;
    }
  }
  console.log(`\n${updated} updated · ${skipped} already current · ${failed} failed\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    let args;
    try {
      args = parseArgs(process.argv.slice(2));
    } catch (e) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
    if (!args.lang) {
      console.error('Usage:\n  node scripts/youtube/series.mjs --lang fr --status\n  node scripts/youtube/series.mjs --lang fr --backfill [--dry-run] [--only N]');
      process.exit(1);
    }
    try {
      if (args.backfill) await backfill(args);
      else printStatus(args.lang, args.level || 'A1');
      process.exit(0);
    } catch (e) {
      console.error(`\n✗ ${(e && e.message) || e}`);
      process.exit(1);
    }
  })();
}
