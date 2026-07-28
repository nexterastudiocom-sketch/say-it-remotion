// assets.mjs — thumbnail, captions, and playlist attachment.
//
// Each function returns { ok, skipped, error } and NEVER throws. A failed
// thumbnail or caption must not lose the upload.

import { createReadStream, existsSync, statSync, readSync, openSync, closeSync } from 'node:fs';
import { google } from 'googleapis';

const TWO_MB = 2 * 1024 * 1024;

function result(partial) {
  return { ok: false, skipped: false, error: null, ...partial };
}

// Read PNG width/height from the IHDR chunk without extra deps.
function pngSize(filePath) {
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(24);
    readSync(fd, buf, 0, 24, 0);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const sig = buf.subarray(0, 8).toString('hex');
    if (sig !== '89504e470d0a1a0a') return null;
    // IHDR starts at byte 16 (width), 20 (height), big-endian uint32
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Set the video thumbnail. Validates 1280x720 and < 2 MB before the call.
 */
export async function setThumbnail(auth, videoId, thumbPath) {
  if (!thumbPath || !existsSync(thumbPath)) {
    return result({ skipped: true, error: `thumbnail not found: ${thumbPath}` });
  }
  try {
    const size = statSync(thumbPath).size;
    if (size >= TWO_MB) {
      return result({ skipped: true, error: `thumbnail is ${(size / 1024 / 1024).toFixed(2)}MB (must be < 2MB)` });
    }
    const dims = pngSize(thumbPath);
    if (dims && (dims.width !== 1280 || dims.height !== 720)) {
      return result({ skipped: true, error: `thumbnail is ${dims.width}x${dims.height} (must be 1280x720)` });
    }
    const youtube = google.youtube({ version: 'v3', auth });
    await youtube.thumbnails.set({
      videoId,
      media: { body: createReadStream(thumbPath) },
    });
    return result({ ok: true });
  } catch (e) {
    return result({ error: String((e && e.message) || e) });
  }
}

/**
 * Insert a caption track (isDraft:false so it goes live). Captions are optional;
 * a missing SRT is a skip, not an error.
 */
export async function insertCaptions(auth, videoId, srtPath, language, name = '') {
  if (!srtPath || !existsSync(srtPath)) {
    return result({ skipped: true, error: `caption file not found: ${srtPath}` });
  }
  try {
    const youtube = google.youtube({ version: 'v3', auth });
    await youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          language,
          name,
          isDraft: false,
        },
      },
      media: { body: createReadStream(srtPath) },
    });
    return result({ ok: true });
  } catch (e) {
    return result({ error: String((e && e.message) || e) });
  }
}

/**
 * Add the video to a playlist. An "already in playlist" style error is treated
 * as success.
 */
export async function addToPlaylist(auth, videoId, playlistId, position) {
  if (!playlistId) {
    return result({ skipped: true, error: 'no playlistId configured' });
  }
  try {
    const youtube = google.youtube({ version: 'v3', auth });
    const requestBody = {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    };
    if (Number.isInteger(position)) requestBody.snippet.position = position;
    await youtube.playlistItems.insert({ part: ['snippet'], requestBody });
    return result({ ok: true });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/already|duplicate|exist/i.test(msg)) {
      return result({ ok: true, skipped: true, error: 'already in playlist' });
    }
    return result({ error: msg });
  }
}

export { pngSize };
