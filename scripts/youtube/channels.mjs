// channels.mjs — connect a YouTube channel to Mosaic, and report on it.
//
//   node scripts/youtube/channels.mjs --status
//   node scripts/youtube/channels.mjs --connect fr
//   node scripts/youtube/channels.mjs --connect fr --level A1 [--force] [--dry-run]
//
// config/channels.json ships with every channelId and playlist id as an empty
// string, which means publish.mjs can upload but never files anything into a
// course playlist — and playlists are the whole "suggested / next video" leg of
// the ranking model in docs/youtube-seo-spec.md. Filling those ids in by hand,
// per language, is exactly the kind of step that gets done wrong once and then
// silently misfiles a whole course.
//
// So: authorise, ask YouTube who we are, find-or-create the course playlist, and
// write the ids back.
//
// The one guard worth having: if the config already names a DIFFERENT channel
// than the credential just authorised, stop. That mismatch means the wrong
// Google account is signed in, and the failure mode — a French course uploaded
// to the Spanish channel — is tedious to undo and looks like spam while it
// lasts. --force is required to overwrite.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHANNELS_PATH = path.join(REPO_ROOT, 'config', 'channels.json');

const LANG_NAMES = {
  fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', de: 'German',
};

export function langName(code) {
  return LANG_NAMES[code] || (code ? code.toUpperCase() : 'Language');
}

// --- pure helpers (unit-tested; no network, no disk) ----------------------

/**
 * The playlist is a search surface in its own right, so it gets a real title
 * rather than "A1". Same head-keyword-first shape as a video title.
 */
export function playlistTitle(lang, level) {
  return `${langName(lang)} for Beginners — Full ${level} Course`;
}

export function playlistDescription(lang, level, appUrl = '') {
  const L = langName(lang);
  return [
    `Every ${L} ${level} lesson in order. Learn ${L} by speaking it out loud — each lesson ` +
      `takes a small set of words and takes you from hearing them to saying them in a full sentence.`,
    '',
    'Start at lesson 1 and work through in order. Each lesson builds on the last.',
    appUrl ? `\n🃏 Free flashcard practice: ${appUrl}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Decide what should change in the config, without changing anything.
 *
 * @returns {{ok:boolean, conflict?:string, changes:Array<{field:string,from:string,to:string}>, next:object}}
 */
export function planChannelUpdate(entry, discovered, { force = false } = {}) {
  const current = entry || {};
  const changes = [];
  const next = { ...current };

  const curId = String(current.channelId || '').trim();
  const newId = String(discovered.channelId || '').trim();
  if (!newId) return { ok: false, conflict: 'YouTube returned no channel id', changes: [], next: current };

  if (curId && curId !== newId && !force) {
    return {
      ok: false,
      conflict:
        `config names channel ${curId} but the authorised credential is ${newId} ` +
        `(${discovered.title || 'untitled'}). Refusing to overwrite — check which Google ` +
        `account is signed in. Re-run with --force if the change is intended.`,
      changes: [],
      next: current,
    };
  }

  if (curId !== newId) {
    changes.push({ field: 'channelId', from: curId || '(empty)', to: newId });
    next.channelId = newId;
  }

  if (discovered.playlists) {
    const playlists = { ...(current.playlists || {}) };
    for (const [level, id] of Object.entries(discovered.playlists)) {
      if (!id) continue;
      if (playlists[level] !== id) {
        changes.push({ field: `playlists.${level}`, from: playlists[level] || '(empty)', to: id });
        playlists[level] = id;
      }
    }
    next.playlists = playlists;
  }

  if (discovered.title && current.channelTitle !== discovered.title) {
    changes.push({ field: 'channelTitle', from: current.channelTitle || '(empty)', to: discovered.title });
    next.channelTitle = discovered.title;
  }

  return { ok: true, changes, next };
}

/** Health of one language's configuration, for --status. */
export function channelHealth(lang, entry, { hasToken = false, publishedCount = 0 } = {}) {
  const e = entry || {};
  const problems = [];
  if (!hasToken) problems.push('not authorised');
  if (!String(e.channelId || '').trim()) problems.push('no channelId');
  const playlists = e.playlists || {};
  const levels = Object.keys(playlists);
  const emptyLevels = levels.filter((l) => !String(playlists[l] || '').trim());
  if (emptyLevels.length) problems.push(`no playlist id for ${emptyLevels.join(', ')}`);
  if (!levels.length) problems.push('no playlists configured');
  return {
    lang,
    connected: problems.length === 0,
    channelId: e.channelId || '',
    channelTitle: e.channelTitle || '',
    playlists,
    publishedCount,
    problems,
  };
}

// --- disk ------------------------------------------------------------------

export function readChannels(p = CHANNELS_PATH) {
  if (!existsSync(p)) throw new Error(`Channel config missing: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function writeChannels(config, p = CHANNELS_PATH) {
  writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return p;
}

function tokenPath(lang) {
  return path.join(REPO_ROOT, 'secrets', 'youtube', `${lang}.json`);
}

export function hasToken(lang) {
  return existsSync(tokenPath(lang));
}

function publishedCount(lang) {
  const p = path.join(REPO_ROOT, 'out', 'publish-log.json');
  if (!existsSync(p)) return 0;
  try {
    const log = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(log) ? log.filter((e) => e.lang === lang && e.videoId).length : 0;
  } catch {
    return 0;
  }
}

// --- network ---------------------------------------------------------------

/** Ask YouTube which channel this credential owns. */
export async function discoverChannel(auth) {
  const { google } = await import('googleapis');
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.channels.list({ part: ['id', 'snippet', 'statistics'], mine: true });
  const item = (res.data.items || [])[0];
  if (!item) {
    throw new Error(
      'This Google account has no YouTube channel. Create the channel first at ' +
      'youtube.com, then re-run --connect.'
    );
  }
  return {
    channelId: item.id,
    title: (item.snippet && item.snippet.title) || '',
    customUrl: (item.snippet && item.snippet.customUrl) || '',
    videoCount: Number((item.statistics && item.statistics.videoCount) || 0),
    subscriberCount: Number((item.statistics && item.statistics.subscriberCount) || 0),
  };
}

/**
 * Find the course playlist by title, or create it.
 * Matching on title is deliberate: re-running --connect must not mint a second
 * playlist and split the course across two of them.
 */
export async function ensurePlaylist(auth, { lang, level, appUrl = '', dryRun = false }) {
  const { google } = await import('googleapis');
  const youtube = google.youtube({ version: 'v3', auth });
  const wanted = playlistTitle(lang, level);

  let pageToken;
  do {
    const res = await youtube.playlists.list({
      part: ['id', 'snippet'], mine: true, maxResults: 50, pageToken,
    });
    for (const p of res.data.items || []) {
      if (p.snippet && p.snippet.title === wanted) {
        return { id: p.id, title: wanted, created: false };
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  if (dryRun) return { id: '', title: wanted, created: false, wouldCreate: true };

  const res = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: wanted, description: playlistDescription(lang, level, appUrl) },
      status: { privacyStatus: 'public' },
    },
  });
  return { id: res.data.id, title: wanted, created: true };
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const args = { levels: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--status': args.status = true; break;
      case '--connect': args.connect = next(); break;
      case '--level': args.levels.push(next()); break;
      case '--force': args.force = true; break;
      case '--dry-run': args.dryRun = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function printStatus(config) {
  const line = '─'.repeat(72);
  console.log('\n' + line);
  console.log('Mosaic → YouTube channel status');
  console.log(line);
  let connected = 0;
  for (const lang of Object.keys(config)) {
    const h = channelHealth(lang, config[lang], {
      hasToken: hasToken(lang),
      publishedCount: publishedCount(lang),
    });
    if (h.connected) connected++;
    const mark = h.connected ? '✓' : '·';
    console.log(`\n${mark} ${lang.toUpperCase()}  ${h.channelTitle || '(unknown channel)'}`);
    console.log(`    channelId : ${h.channelId || '—'}`);
    const pls = Object.entries(h.playlists);
    console.log(`    playlists : ${pls.length ? pls.map(([k, v]) => `${k}=${v || '—'}`).join('  ') : '—'}`);
    console.log(`    published : ${h.publishedCount} video(s) in out/publish-log.json`);
    if (h.problems.length) console.log(`    todo      : ${h.problems.join('; ')}`);
  }
  console.log(`\n${connected}/${Object.keys(config).length} channels fully connected.`);
  if (connected < Object.keys(config).length) {
    console.log('Connect one with:  node scripts/youtube/channels.mjs --connect <lang>\n');
  } else {
    console.log('');
  }
}

async function connect(args, config) {
  const lang = args.connect;
  if (!config[lang]) throw new Error(`No entry for "${lang}" in config/channels.json`);

  const entry = config[lang];
  const levels = args.levels.length ? args.levels : Object.keys(entry.playlists || { A1: '' });

  const { getClient, authorize } = await import('./auth.mjs');
  if (!hasToken(lang)) {
    console.log(`No stored credential for "${lang}" — starting consent flow.`);
    await authorize(lang);
  }
  const auth = await getClient(lang);

  const discovered = await discoverChannel(auth);
  console.log(`\nAuthorised channel: ${discovered.title} (${discovered.channelId})`);
  console.log(`  ${discovered.videoCount} video(s) · ${discovered.subscriberCount} subscriber(s)`);
  if (discovered.customUrl) console.log(`  ${discovered.customUrl}`);

  const playlists = {};
  for (const level of levels) {
    const pl = await ensurePlaylist(auth, {
      lang, level, appUrl: entry.appUrl || '', dryRun: args.dryRun,
    });
    playlists[level] = pl.id;
    const how = pl.wouldCreate ? 'would create' : pl.created ? 'created' : 'found';
    console.log(`  playlist ${level}: ${how} "${pl.title}"${pl.id ? ' → ' + pl.id : ''}`);
  }

  const plan = planChannelUpdate(entry, { ...discovered, playlists }, { force: args.force });
  if (!plan.ok) {
    console.error(`\n✗ ${plan.conflict}`);
    process.exit(1);
  }

  if (!plan.changes.length) {
    console.log('\n✓ config/channels.json is already up to date.\n');
    return;
  }

  console.log('\nChanges to config/channels.json:');
  for (const c of plan.changes) console.log(`  ${c.field}: ${c.from} → ${c.to}`);

  if (args.dryRun) {
    console.log('\n--dry-run: nothing written.\n');
    return;
  }

  config[lang] = plan.next;
  writeChannels(config);
  console.log(`\n✓ wrote config/channels.json\n`);
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
    if (!args.status && !args.connect) {
      console.error('Usage:\n  node scripts/youtube/channels.mjs --status\n  node scripts/youtube/channels.mjs --connect <lang> [--level A1] [--force] [--dry-run]');
      process.exit(1);
    }
    try {
      const config = readChannels();
      if (args.connect) await connect(args, config);
      else printStatus(config);
      process.exit(0);
    } catch (e) {
      console.error(`\n✗ ${(e && e.message) || e}`);
      process.exit(1);
    }
  })();
}
