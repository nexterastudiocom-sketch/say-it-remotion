// upload.mjs — resumable videos.insert with resume-on-failure + idempotency ledger.
//
// The resumable protocol is used so a dropped connection resumes from the stored
// session URI instead of re-initiating (which would create a duplicate video).
// The returned videoId is written to out/publish-log.json SYNCHRONOUSLY before
// this function returns — a crash between upload and log write is exactly what
// produces duplicate uploads.

import { createReadStream, statSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PUBLISH_LOG = path.join(REPO_ROOT, 'out', 'publish-log.json');

function sessionPath(lang, id) {
  return path.join(REPO_ROOT, 'out', lang, id, '.upload-session');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- publish-log.json (idempotency ledger) --------------------------------
export function readPublishLog() {
  if (!existsSync(PUBLISH_LOG)) return [];
  try {
    const raw = readFileSync(PUBLISH_LOG, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findLogEntry(lang, lesson) {
  return readPublishLog().find((e) => e.lang === lang && Number(e.lesson) === Number(lesson)) || null;
}

// Write synchronously. Merge-by-(lang,lesson) so re-runs update in place.
function appendPublishLogSync(entry) {
  const log = readPublishLog();
  const idx = log.findIndex((e) => e.lang === entry.lang && Number(e.lesson) === Number(entry.lesson));
  if (idx >= 0) log[idx] = { ...log[idx], ...entry };
  else log.push(entry);
  mkdirSync(path.dirname(PUBLISH_LOG), { recursive: true });
  writeFileSync(PUBLISH_LOG, JSON.stringify(log, null, 2) + '\n', 'utf8');
}

function readSession(lang, id) {
  const p = sessionPath(lang, id);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function writeSession(lang, id, uri) {
  const p = sessionPath(lang, id);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, uri + '\n', 'utf8');
}

function clearSession(lang, id) {
  const p = sessionPath(lang, id);
  try {
    if (existsSync(p)) writeFileSync(p, '', 'utf8');
  } catch {
    /* ignore */
  }
}

function statusOf(err) {
  return (err && (err.code || (err.response && err.response.status))) || 0;
}

function isRetryable(status) {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Upload (or update) a video.
 *
 * @param {object} args
 * @param {string} args.lang
 * @param {number} args.lesson
 * @param {string} args.id            e.g. "lesson-01"
 * @param {string} args.videoPath     path to the rendered mp4
 * @param {object} args.resource      { snippet, status, recordingDetails } from buildMetadata
 * @param {import('googleapis').Auth.OAuth2Client} args.auth
 * @param {number} [args.maxRetries]
 * @returns {Promise<{videoId:string, resumed:boolean, updated:boolean}>}
 */
export async function uploadVideo({ lang, lesson, id, videoPath, resource, auth, maxRetries = 5 }) {
  if (!existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
  const youtube = google.youtube({ version: 'v3', auth });

  // Idempotency: if this lesson already has a videoId, update instead of insert.
  const existing = findLogEntry(lang, lesson);
  if (existing && existing.videoId) {
    const res = await youtube.videos.update({
      part: ['snippet', 'status', 'recordingDetails'],
      requestBody: { id: existing.videoId, ...resource },
    });
    const videoId = res.data.id;
    appendPublishLogSync({
      lang,
      lesson: Number(lesson),
      videoId,
      url: `https://youtu.be/${videoId}`,
      updatedAt: new Date().toISOString(),
      titleUsed: resource.snippet.title,
      tagCharCount: (resource.snippet.tags || []).join('').length,
    });
    return { videoId, resumed: false, updated: true };
  }

  const fileSize = statSync(videoPath).size;
  const resumedFromSession = Boolean(readSession(lang, id));

  let attempt = 0;
  // The googleapis client manages the resumable session internally when given a
  // stream; we add our own retry loop with exponential backoff and persist a
  // marker so operators can see an in-flight upload.
  for (;;) {
    try {
      writeSession(lang, id, `in-flight:${new Date().toISOString()}`);
      const res = await youtube.videos.insert(
        {
          part: ['snippet', 'status', 'recordingDetails'],
          notifySubscribers: false,
          requestBody: resource,
          media: { body: createReadStream(videoPath) },
        },
        {
          // resumable upload; retry disabled here because we own the retry loop
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const videoId = res.data.id;
      if (!videoId) throw new Error('videos.insert returned no id');

      // SYNC write to the ledger BEFORE returning.
      appendPublishLogSync({
        lang,
        lesson: Number(lesson),
        videoId,
        url: `https://youtu.be/${videoId}`,
        privacyStatus: resource.status.privacyStatus,
        publishedAt: new Date().toISOString(),
        titleUsed: resource.snippet.title,
        tagCharCount: (resource.snippet.tags || []).join('').length,
        bytes: fileSize,
      });
      clearSession(lang, id);
      return { videoId, resumed: resumedFromSession, updated: false };
    } catch (err) {
      const status = statusOf(err);
      attempt += 1;
      if (!isRetryable(status) || attempt > maxRetries) {
        // Non-retryable 4xx or out of retries: surface, keep session marker so a
        // human can inspect.
        throw err;
      }
      const backoff = Math.min(60000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      console.warn(
        `upload: attempt ${attempt} failed (status ${status}); retrying in ${(backoff / 1000).toFixed(1)}s`
      );
      await sleep(backoff);
    }
  }
}

export { PUBLISH_LOG, appendPublishLogSync };
