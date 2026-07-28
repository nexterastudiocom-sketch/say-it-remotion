// auth.mjs — installed-app OAuth2 for the Mosaic YouTube uploader.
//
// Installed-app (loopback) flow, NOT a service account — service accounts cannot
// own or upload to a YouTube channel. One refresh token per channel, stored at
// secrets/youtube/<lang>.json.
//
//   getClient(lang)  -> authorised google.auth.OAuth2 client (auto-refreshes)
//   authorize(lang)  -> interactive consent; run once per channel to mint a token
//
// Run the interactive flow with:
//   node scripts/youtube/auth.mjs --lang fr

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const REDIRECT_PORT = 4600;
const REDIRECT_PATH = '/oauth2callback';
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

function tokenPath(lang) {
  return path.join(REPO_ROOT, 'secrets', 'youtube', `${lang}.json`);
}

function reauthHint(lang) {
  return `  node scripts/youtube/auth.mjs --lang ${lang}`;
}

// Locate the OAuth desktop-app client secret. Prefer an env var, then a
// client_secret*.json at the repo root (gitignored).
async function loadClientSecret() {
  const fromEnv = process.env.YOUTUBE_CLIENT_SECRET_JSON;
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv);
    } catch {
      throw new Error('YOUTUBE_CLIENT_SECRET_JSON is set but is not valid JSON');
    }
  }
  const explicit = process.env.YOUTUBE_CLIENT_SECRET_FILE;
  const candidates = [];
  if (explicit) candidates.push(path.resolve(REPO_ROOT, explicit));
  // common default names dropped at repo root
  for (const name of ['client_secret.json']) {
    candidates.push(path.join(REPO_ROOT, name));
  }
  // any client_secret*.json at repo root
  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(REPO_ROOT);
    for (const e of entries) {
      if (/^client_secret.*\.json$/.test(e)) candidates.push(path.join(REPO_ROOT, e));
    }
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    if (existsSync(c)) {
      const raw = await readFile(c, 'utf8');
      return JSON.parse(raw);
    }
  }
  throw new Error(
    'No OAuth client secret found. Create an OAuth 2.0 *Desktop app* credential in ' +
      'Google Cloud, download it, and save it as client_secret.json at the repo root ' +
      '(or set YOUTUBE_CLIENT_SECRET_FILE / YOUTUBE_CLIENT_SECRET_JSON).'
  );
}

function makeOAuthClient(secret) {
  const conf = secret.installed || secret.web || secret;
  const clientId = conf.client_id;
  const clientSecret = conf.client_secret;
  if (!clientId || !clientSecret) {
    throw new Error('Client secret JSON is missing client_id / client_secret (is it a Desktop-app credential?)');
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

async function saveToken(lang, tokens) {
  const p = tokenPath(lang);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
  return p;
}

async function loadToken(lang) {
  const p = tokenPath(lang);
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

// Interactive consent. Spins up a loopback server, opens the consent URL, waits
// for the redirect, exchanges the code, and persists the refresh token.
export async function authorize(lang) {
  const secret = await loadClientSecret();
  const oauth2 = makeOAuthClient(secret);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-auth
    scope: SCOPES,
  });

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        if (url.pathname !== REDIRECT_PATH) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const err = url.searchParams.get('error');
        const c = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<html><body style="font-family:sans-serif;padding:2rem">` +
            (err
              ? `<h2>Authorisation failed</h2><p>${err}</p>`
              : `<h2>Mosaic — ${lang} channel authorised</h2><p>You can close this tab and return to the terminal.</p>`) +
            `</body></html>`
        );
        server.close();
        if (err) reject(new Error(`OAuth error: ${err}`));
        else if (c) resolve(c);
        else reject(new Error('No authorization code in redirect'));
      } catch (e) {
        reject(e);
      }
    });
    server.on('error', reject);
    server.listen(REDIRECT_PORT, () => {
      console.log(`\nMosaic YouTube auth — channel: ${lang}`);
      console.log('Open this URL in your browser and grant access:\n');
      console.log('  ' + authUrl + '\n');
      console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`);
    });
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    // Google only returns a refresh token on first consent unless prompt=consent.
    const existing = await loadToken(lang);
    if (existing && existing.refresh_token) tokens.refresh_token = existing.refresh_token;
  }
  const saved = await saveToken(lang, tokens);
  console.log(`\nSaved refresh token → ${path.relative(REPO_ROOT, saved)}`);
  return tokens;
}

// Return an authorised client for a channel. Throws a helpful message (not a raw
// stack) when the stored grant is missing or has been revoked.
export async function getClient(lang) {
  const secret = await loadClientSecret();
  const oauth2 = makeOAuthClient(secret);

  const tokens = await loadToken(lang);
  if (!tokens || !tokens.refresh_token) {
    throw new Error(
      `No stored credential for "${lang}". Authorise this channel first:\n` + reauthHint(lang)
    );
  }
  oauth2.setCredentials(tokens);

  // Persist any refreshed tokens back to disk so future runs stay valid.
  oauth2.on('tokens', async (t) => {
    try {
      const merged = { ...tokens, ...t };
      await saveToken(lang, merged);
    } catch {
      /* non-fatal */
    }
  });

  // Proactively validate / refresh the access token.
  try {
    await oauth2.getAccessToken();
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/invalid_grant/i.test(msg)) {
      const clean = new Error(
        `The stored grant for "${lang}" is no longer valid (invalid_grant — token revoked or expired).\n` +
          `Re-authorise this channel:\n` +
          reauthHint(lang)
      );
      clean.code = 'INVALID_GRANT';
      throw clean;
    }
    throw e;
  }

  return oauth2;
}

// CLI entry: node scripts/youtube/auth.mjs --lang fr
function parseLang(argv) {
  const i = argv.indexOf('--lang');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const addI = argv.indexOf('--add-channel');
  if (addI >= 0 && argv[addI + 1]) return argv[addI + 1];
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lang = parseLang(process.argv.slice(2));
  if (!lang) {
    console.error('Usage: node scripts/youtube/auth.mjs --lang <lang>');
    process.exit(1);
  }
  authorize(lang)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('\nAuthorisation failed:', (e && e.message) || e);
      process.exit(1);
    });
}
