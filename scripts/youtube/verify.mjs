// verify.mjs — poll processing state; detect locks and rejections.
//
// verifyVideo(auth, videoId) polls videos.list and returns a structured result
// distinguishing: still processing, processed-and-fine, processed-but-locked-
// private, rejected (with reason), failed (with reason). The locked-private case
// is the one that matters most — it is surfaced prominently.

import { google } from 'googleapis';

const AUDIT_FORM =
  'YouTube API compliance audit / verification: https://support.google.com/youtube/contact/yt_api_form';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * One poll. Returns a structured status.
 * state ∈ { processing | processed | lockedPrivate | rejected | failed | unknown }
 */
export async function checkOnce(auth, videoId) {
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.videos.list({
    part: ['status', 'processingDetails', 'snippet'],
    id: [videoId],
  });
  const item = res.data.items && res.data.items[0];
  if (!item) {
    return { state: 'unknown', videoId, reason: 'video not found (may still be registering)' };
  }
  const status = item.status || {};
  const processing = item.processingDetails || {};
  const uploadStatus = status.uploadStatus;
  const failureReason = status.failureReason;
  const rejectionReason = status.rejectionReason;
  const privacyStatus = status.privacyStatus;

  if (uploadStatus === 'rejected') {
    return {
      state: 'rejected',
      videoId,
      privacyStatus,
      reason: rejectionReason || 'unspecified rejection (copyright / duplicate / TOS)',
    };
  }
  if (uploadStatus === 'failed') {
    return { state: 'failed', videoId, privacyStatus, reason: failureReason || 'unspecified failure' };
  }
  if (uploadStatus === 'uploaded' || processing.processingStatus === 'processing') {
    return {
      state: 'processing',
      videoId,
      privacyStatus,
      progress: processing.processingProgress || null,
    };
  }
  if (uploadStatus === 'processed') {
    // Locked-private: an unverified project or a policy filter can force privacy
    // to private and lock it. We can only detect the private state here; flag it
    // so a human can confirm against Studio.
    if (privacyStatus === 'private') {
      return {
        state: 'lockedPrivate',
        videoId,
        privacyStatus,
        reason:
          'Video processed but privacy is PRIVATE. If you did not intend private, the project is ' +
          'likely unverified or the metadata tripped a policy filter. This is not appealable by ' +
          'delete/re-upload cleanly.\n  → ' +
          AUDIT_FORM,
      };
    }
    return { state: 'processed', videoId, privacyStatus };
  }
  return { state: 'unknown', videoId, privacyStatus, reason: `uploadStatus=${uploadStatus}` };
}

/**
 * Poll until terminal or timeout.
 * @returns final structured status.
 */
export async function verifyVideo(auth, videoId, { intervalMs = 30000, maxMs = 20 * 60 * 1000 } = {}) {
  const deadline = Date.now() + maxMs;
  let last = null;
  for (;;) {
    last = await checkOnce(auth, videoId);
    if (last.state !== 'processing' && last.state !== 'unknown') return last;
    if (Date.now() >= deadline) {
      return { ...last, state: 'processing', timedOut: true, reason: 'still processing after max wait' };
    }
    await sleep(intervalMs);
  }
}

export { AUDIT_FORM };
