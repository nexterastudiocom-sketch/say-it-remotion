---
description: QC, generate SEO metadata, and upload a rendered lesson to its YouTube channel
argument-hint: <lang> <lesson-id> [--schedule YYYY-MM-DDTHH:MM] [--go-live]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node:*), Bash(python3:*), Bash(ffprobe:*), Bash(git:*)
---

# /publish — Say It → YouTube

Publish lesson **$2** of the **$1** course. Extra flags: `$ARGUMENTS`

You are operating the release step of a production pipeline. Videos represent real
published work on a real channel. Be conservative: it is always better to stop and ask
than to publish something wrong. **A bad upload cannot be cleanly undone** — deleting and
re-uploading loses the video ID, the URL, and any early engagement signal.

---

## Hard rules

1. **Never set `privacyStatus: "public"` on the initial upload.** Always upload as
   `private`. Going live is a separate, explicit step (see Stage 7).
2. **Never invent metadata.** Every word, translation, timestamp, and chapter title must
   trace back to the lesson JSON or the transcript. If a field is missing, stop and ask.
3. **Idempotency is mandatory.** Check `out/publish-log.json` before uploading. If this
   lesson already has a `videoId`, do **not** upload again — update the existing video
   with `videos.update` instead, and say so.
4. **QC is a gate, not a formality.** If `say_it_qc.py` fails, stop. Report the failures.
   Do not publish "with a note about" a failure.
5. **Follow `docs/youtube-seo-spec.md` exactly** for every metadata field. It is the
   source of truth, not your own judgement about what reads well.

---

## Stage 1 — Resolve inputs

Locate and read, failing loudly if any are missing:

| Input | Expected path |
|---|---|
| Rendered video | `out/{lang}/L{NN}/final.mp4` |
| Lesson JSON | `lessons/{lang}/L{NN}.json` |
| Overrides JSON | `lessons/{lang}/L{NN}.overrides.json` |
| Transcript | `transcripts/{lang}/L{NN}*.md` |
| Thumbnail | `out/{lang}/L{NN}/thumb.png` |
| Captions | `out/{lang}/L{NN}/captions.en.srt`, `captions.{lang}.srt` |
| Channel config | `config/channels.json` |
| SEO spec | `docs/youtube-seo-spec.md` |

Print a short table of what you found and what is missing. **Stop if the video, lesson
JSON, or SEO spec is missing.** Missing thumbnail or captions is a warning, not a blocker
— but say clearly what will be skipped.

## Stage 2 — QC gate

```bash
python3 say_it_qc.py --video out/{lang}/L{NN}/final.mp4 \
                     --transcript transcripts/{lang}/L{NN}*.md \
                     --rubric qc/rubric.yaml
```

Also verify independently with `ffprobe`: 3840×2160, 30fps, H.264, AAC, and duration
within 18–25 minutes. Report loudness (target −14 LUFS).

**If any check fails, stop here.** List each failure with its rule ID.

## Stage 3 — Build metadata

Read `docs/youtube-seo-spec.md` and construct the full metadata object from the lesson
data. Derive chapters from the section boundaries in the lesson JSON, not by guessing at
the transcript.

Then **print the metadata for review before doing anything else** — title with its
character count, the first 150 characters of the description as they'll appear in search,
the full description, the tag list with its total character count, and the chapter list.

Self-check against the spec before printing:
- Title ≤ 100 chars (target 55–65). Primary keyword in the first 40 characters.
- Description ≤ 5000 chars. Hook and keyword in the first 150.
- Chapters: first is `00:00`, at least 3 total, each ≥ 10 seconds, in ascending order.
- Tags: ≤ 500 chars total. **Every tag genuinely describes this video.** Unrelated or
  misleading tags are a documented cause of videos being locked private — this is a real
  enforcement risk, not a style preference.
- Vocabulary list matches the lesson's taught words exactly. No extra words.
- `categoryId: "27"` (Education), `selfDeclaredMadeForKids: false`.
- `containsSyntheticMedia` set per the spec's disclosure rule.

## Stage 4 — Upload (private)

```bash
node scripts/youtube/publish.js \
  --lang {lang} --lesson {NN} \
  --privacy private \
  --metadata out/{lang}/L{NN}/metadata.json
```

Resumable upload. On network failure, resume — do not restart from byte zero, and do not
create a second video. Write the returned `videoId` to `out/publish-log.json` immediately,
before doing anything else, so a later crash can't cause a duplicate upload.

## Stage 5 — Attach assets

In this order, each tolerant of failure (log and continue):
1. `thumbnails.set` — 1280×720, under 2 MB.
2. `captions.insert` — English track first (`isDraft: false`), then the target-language
   track. Caption text is indexed by YouTube search; this is the highest-value optional step.
3. `playlistItems.insert` — add to the level playlist at `position` = lesson number − 1.

## Stage 6 — Verify

Poll `videos.list?part=status,processingDetails` every 30s (max 20 minutes) until
`uploadStatus` is `processed`.

Then check for silent failure modes and report each explicitly:
- `status.privacyStatus` — if it flipped to `private` and locked, the project is likely
  unverified or the metadata tripped a policy filter.
- `status.rejectionReason` — copyright, duplicate, TOS.
- `status.uploadStatus === "failed"` → report `failureReason`.

## Stage 7 — Going live (requires explicit confirmation)

Do **not** perform this automatically, even if `--go-live` was passed. Print the watch URL,
ask the user to review the video in YouTube Studio, and wait for a clear yes in chat.

Once confirmed:
- With `--schedule`: `videos.update` setting `status.publishAt` to the ISO timestamp
  (keeping `privacyStatus: private` — YouTube flips it at the scheduled time).
- Without: `videos.update` setting `privacyStatus: public`.

Scheduling is preferred. A steady cadence reads as a real channel; a batch of
simultaneous uploads reads as templated mass production.

## Stage 8 — Log and report

Append to `out/publish-log.json`:

```json
{
  "lang": "fr", "lesson": 3, "videoId": "...", "url": "https://youtu.be/...",
  "publishedAt": "2026-07-27T14:00:00Z", "scheduledFor": null,
  "playlistId": "...", "captionTracks": ["en", "fr"],
  "thumbnailSet": true, "qcPassed": true, "titleUsed": "...", "tagCharCount": 412
}
```

Then report in six lines or fewer: video URL, privacy state, what succeeded, what was
skipped, and the one thing that still needs a human (end screens and cards cannot be set
via the API — they are always a manual Studio step).

---

## Manual steps this command cannot do

State these at the end every time, so they don't get forgotten:
- End screens and info cards (API does not expose them)
- Community post announcing the lesson
- Pinned comment with the app link
