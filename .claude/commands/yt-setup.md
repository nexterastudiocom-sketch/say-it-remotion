---
description: One-time — scaffold the YouTube upload module and per-channel OAuth
argument-hint: [--add-channel <lang>]
allowed-tools: Read, Write, Edit, Glob, Bash(node:*), Bash(npm:*), Bash(git:*)
---

# /yt-setup — build the YouTube uploader

Run once per repo. Then `--add-channel <lang>` for each additional channel.

Build a Node module in `scripts/youtube/` for the `say-it-remotion` repo. Match the
existing code style. Do not add a framework; `googleapis` and `dotenv` are enough.

## Files to create

```
scripts/youtube/
  auth.js         OAuth2 per channel; token load/refresh/store
  metadata.js     lesson JSON + SEO spec → videos.insert resource
  upload.js       resumable videos.insert with resume-on-failure
  assets.js       thumbnails.set, captions.insert, playlistItems.insert
  verify.js       poll processing state; detect locks and rejections
  publish.js      CLI orchestrator (entry point)
config/channels.json          committed — channel IDs, playlist IDs, defaults
secrets/youtube/{lang}.json   gitignored — refresh tokens
out/publish-log.json          gitignored — idempotency ledger
docs/youtube-seo-spec.md      the metadata rules (already written — do not overwrite)
```

Add to `.gitignore`: `secrets/`, `out/publish-log.json`, `client_secret*.json`.
Add to `package.json`: `"publish:yt": "node scripts/youtube/publish.js"`.

## auth.js

Installed-app OAuth2 (loopback redirect on `http://localhost:4600/oauth2callback`), not a
service account — service accounts cannot own YouTube channels.

Scopes: `youtube.upload`, `youtube` (playlists), `youtube.force-ssl` (captions).

One refresh token per channel at `secrets/youtube/{lang}.json`. Export
`getClient(lang)`. On `invalid_grant`, print the exact re-auth command rather than
throwing a raw stack trace.

## metadata.js

Pure function: `buildMetadata(lesson, overrides, seoConfig) → { snippet, status, recordingDetails }`.

No network calls, no file reads — it takes data in and returns an object. This makes it
unit-testable and keeps the SEO rules in one reviewable place.

Enforce these as hard assertions that throw, not warnings:

```js
snippet.title.length <= 100
snippet.description.length <= 5000
snippet.tags.join('').length <= 500
snippet.categoryId === '27'
status.selfDeclaredMadeForKids === false
chapters[0].start === 0 && chapters.length >= 3
chapters.every((c, i) => i === 0 || c.start - chapters[i-1].start >= 10)
```

Merge `overrides` last so manual edits always win. Never let a pipeline regeneration
silently discard a hand-tuned title.

## upload.js

Resumable protocol. Initiate the session, persist the session URI to
`out/{lang}/L{NN}/.upload-session`, and on retry resume from that URI rather than
re-initiating. Exponential backoff on 5xx and 429; do not retry 4xx other than 429.

Write the returned `videoId` to `out/publish-log.json` **synchronously, before returning**.
A crash between upload and log write is what produces duplicate videos.

## assets.js

- `setThumbnail(videoId, path)` — validate 1280×720 and < 2 MB before the call.
- `insertCaptions(videoId, srtPath, lang)` — `isDraft: false` so the track goes live.
- `addToPlaylist(videoId, playlistId, position)` — treat an existing-item error as success.

Each returns `{ ok, skipped, error }` rather than throwing. A failed thumbnail must not
lose the upload.

## verify.js

Poll `videos.list?part=status,processingDetails,snippet`. Return a structured result
distinguishing: still processing, processed and fine, processed but locked private,
rejected (with reason), and failed (with reason). The locked-private case is the one that
matters most — surface it prominently with a pointer to the audit form.

## publish.js

CLI: `--lang --lesson --privacy --schedule --metadata --dry-run --skip-qc`.

`--dry-run` must print the complete resolved metadata and make zero API calls. Default
`--privacy` to `private` — public should require typing it.

Exit non-zero on any failure so CI can gate on it.

## channels.json shape

```json
{
  "fr": {
    "channelId": "UC...",
    "playlists": { "A1": "PL..." },
    "defaultLanguage": "en",
    "defaultAudioLanguage": "en",
    "accentColor": "#2E4FE0",
    "appUrl": "https://sayit.app/fr"
  }
}
```

## Before finishing

1. `node scripts/youtube/publish.js --lang fr --lesson 1 --dry-run` must print valid
   metadata with no credentials present.
2. Write `scripts/youtube/metadata.test.js` covering each assertion above.
3. Print a setup checklist for the human: create the Google Cloud project, enable YouTube
   Data API v3, create OAuth desktop credentials, run the auth flow per channel, and
   **submit the API compliance audit** (see the README note — this one has a lead time and
   should be filed today).
