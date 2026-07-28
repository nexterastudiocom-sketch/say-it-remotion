# Setup — read before running anything

## Where the files go

```
say-it-remotion/
  .claude/commands/publish.md      ← from this pack
  .claude/commands/yt-setup.md     ← from this pack
  docs/youtube-seo-spec.md         ← from this pack (youtube-seo-spec.md)
```

Then in Claude Code:

```
/yt-setup            # once — builds scripts/youtube/
/publish fr 01 --dry-run
/publish fr 01
```

---

## ⚠️ Do this today: the API compliance audit

**New Google Cloud projects have every API upload locked to private.** Any video uploaded
through `videos.insert` from an unverified project created after 28 July 2020 is
restricted to private viewing, and lifting it requires an audit of the project against the
Terms of Service.

The part that bites: **a locked video cannot be appealed.** It has to be re-uploaded
through a verified project or manually through the YouTube site. So if you render 30
lessons and push them before the audit clears, you re-upload all 30.

Sequence:
1. Create the Google Cloud project and enable YouTube Data API v3.
2. File the audit form immediately — it has review lead time.
3. While waiting: build the pipeline, upload to a **test channel**, verify the whole flow
   end to end. Everything works; the videos just stay private.
4. Publish for real once the audit clears.

One project can serve all five channels — the audit is per API project, not per channel.

---

## Quota: not your constraint anymore

Most guides still say an upload costs 1,600 units, which capped you at ~6 uploads/day.
Google cut that. Current official docs put a video upload at 100 units against the 10,000
unit daily default, and uploads now draw on a separate bucket with a documented allowance
of 100 `videos.insert` calls per day.

At 15 videos/week you are nowhere near it. Don't build a quota-scheduling layer.

The one expensive call left is `search.list` at 100 units — avoid it in the pipeline.
Look up playlist IDs once and store them in `config/channels.json`.

---

## Credentials

- OAuth **desktop app** credentials, not a service account — service accounts can't own a
  YouTube channel.
- One refresh token per channel in `secrets/youtube/{lang}.json`, gitignored.
- Scopes: `youtube.upload`, `youtube`, `youtube.force-ssl`.
- The channel needs phone verification before `thumbnails.set` will work.

---

## Suggested order

1. File the audit.
2. `/yt-setup` and get `--dry-run` producing clean metadata.
3. Run the full flow against a private test channel.
4. Tune `docs/youtube-seo-spec.md` on real videos — the title and thumbnail formulas are
   starting points, and the first 10 lessons are your sample.
5. Wire `/publish` into the render pipeline once it's boring.
