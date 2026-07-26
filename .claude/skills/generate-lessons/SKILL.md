---
name: generate-lessons
description: Run the resumable Say It lesson→video generation loop — inspect, validate, dry-run, generate one/range, resume, repair, and approve French (then ES/IT/PT/DE) A1 lessons from the authoritative curriculum. Use when the user wants to build, re-build, validate, or check the status of lesson videos.
---

# Generate Say It lessons

A resumable loop that turns the **authoritative curriculum** into a graded 4K
lesson video: read source → plan → script/audio/images → render → thumbnail →
**objective QC** → repair only what failed → manifest + report. It reuses the
existing proven scripts; it does not reimplement them.

## Golden rules (do not violate)

1. **The curriculum is authoritative.** Never invent French content, translations,
   or pronunciations. If a lesson's source is thin or missing, the loop marks it
   `needs-review` — it does not fill the gap.
2. **Never claim what you didn't measure.** Pronunciation is `needs-review` until
   an STT engine is wired (`config.pipeline.json → pronunciation.enabled`). The
   loop reports "UNVERIFIED", never "verified".
3. **Costly modes need `--yes`.** `one/range/resume/repair` call ElevenLabs +
   Recraft and render for minutes. Without `--yes` they print an estimate and stop.
   **Ask the user before any real generation run.**
4. **Never publish.** The loop stops at `approve` (a human sign-off flag). It
   never uploads to YouTube.
5. **Don't delete existing assets** until a replacement has passed validation.
6. **Secrets stay out of git.** API keys live only in `.env`. Voice IDs and the
   Recraft `style_id` are non-secret defaults baked in code.

## Commands (`npm run lessons -- <mode>`)

| Mode | Cost | What it does |
|------|------|--------------|
| `inspect` | none | Show config gates, discovered sources, per-lesson status. **Start here.** |
| `validate <id>` | none | Run every deterministic gate on what's already on disk (incl. the rendered file). |
| `dry-run <id>` | none | Walk each step and print what *would* run. Generates nothing, writes no status. |
| `status [id]` | none | Print the persistent queue. |
| `one <id> --yes` | $$ | Generate + render + validate a single lesson, with the bounded repair loop. |
| `range <a> <b> --yes` | $$$ | Same across a lesson-number range. |
| `resume --yes` | $$ | Continue every lesson not `completed`/`approved`. |
| `repair <id> --yes` | $ | Validate first, then re-run only the failed sections. |
| `publish <id>` | none* | Build the reloadable project bundle + stage the video, upload to Google Drive (*upload needs rclone; see below). |
| `approve <id>` | none | Human gate: mark a fully-passing lesson `approved` for publish. |

Tests: `npm run lessons:test` (no API, no render — validators against fixtures + the real ffprobe).

## Recommended flow for the human

```
npm run lessons -- inspect
npm run lessons -- validate lesson-01     # see exactly which gates pass/fail today
npm run lessons -- dry-run 1              # confirm the plan
npm run lessons -- one 1 --yes           # generate (only after the user says go)
npm run lessons -- validate lesson-01     # confirm gates
npm run lessons -- approve lesson-01      # human sign-off
```

## Hard gates vs scored rubric

- **Hard gates** (`config/pipeline.json → hardGates`) are pass/fail and block
  `completed`: source valid, assets present, render ok, duration 15:00–25:00,
  3840×2160, 30fps, h264/aac, audio present, no black frames, loudness −14±1.5
  LUFS, A/V sync ±0.15s, pronunciation verified.
- A gate that **can't be measured** in this environment returns `needs-review`
  (not pass, not fail) → the lesson lands in `needs-review`, surfaced for a human.

## Environment limitations (be honest about these)

The **bundled** ffmpeg (inside `node_modules/.bin/remotion`) is minimal
(`loudnorm` + `silencedetect` only), so a **full ffmpeg** is provided by the
`ffmpeg-static` dependency (has `blackdetect` + `ebur128`), auto-detected by
`fullFfmpeg()` (`$FFMPEG_BIN` → system ffmpeg on PATH → ffmpeg-static). **All
hard gates now execute for real:**

- **Loudness** — real, via `loudnorm` JSON analysis. ✅
- **Black-frame** — real, via `blackdetect` (ffmpeg-static). ✅ Degrades to
  `needs-review` only if ffmpeg-static is absent AND no system ffmpeg is on PATH.
- **Pronunciation** — **WORKING** via local **faster-whisper** (`.venv-whisper/`,
  installed on this machine; no system ffmpeg needed — it decodes via PyAV). Config
  is `"auto"`: each FR clip is transcribed and matched to its card text. Backends,
  first available wins: `OPENAI_API_KEY` → faster-whisper venv → `whisper` CLI →
  whisper.cpp. To re-provision elsewhere: `python3 -m venv .venv-whisper &&
  .venv-whisper/bin/pip install faster-whisper` (or set `WHISPER_PY`). With no
  backend it honestly reports `needs-review`.

## Multi-lesson render (done)

The `Lesson-01-FR` composition in `src/Root.tsx` has `calculateMetadata`, so the
loop renders **any** baked lesson JSON via `--props` at that lesson's own length —
no truncation, one composition for all lessons. (Verify with
`remotion compositions src/index.ts`.)

## Publishing to Google Drive (auto after a lesson passes)

When a lesson reaches `completed`, the loop runs `publish` automatically (skip with
`--no-publish`). It:

1. Builds a **reloadable project bundle** — `pipeline/publish/<id>/<id>-project.zip`
   with the transcript, parsed script, baked timeline, **all** audio clips, images,
   cover, and config, at repo-relative paths. Unzip it at the repo root on any
   machine, add `.env`, and `npm run studio` reopens the lesson for editing.
2. Stages the loudness-normalized video alongside it.
3. Uploads both to **Google Drive → `ClaudeAI/Youtube/French/<id>/`** (a new folder
   per lesson).

**The upload needs rclone** — a plain Node script can't use the session's Drive
tools, and a 185 MB 4K video can't go through them anyway. One-time setup:

```
brew install rclone          # or https://rclone.org/downloads/
rclone config                # create a Google Drive remote named e.g. "gdrive"
export SAYIT_GDRIVE_REMOTE=gdrive
export SAYIT_GDRIVE_BASE="ClaudeAI/Youtube/French"   # optional; this is the default
```

Without rclone the bundle + video are still built and staged in
`pipeline/publish/<id>/`, and the step prints exactly what to upload — nothing is
silently skipped. (The per-lesson Drive folders + a manifest/README can also be
seeded directly through the Drive tools in a Claude session.)

## Where things live

- Config/thresholds: `config/pipeline.json`
- Orchestrator: `scripts/pipeline/orchestrate.mjs`
- Validators (ffprobe/ffmpeg): `scripts/pipeline/validate.mjs`
- Shared lib (status store, retries, hashing, logging): `scripts/pipeline/lib.mjs`
- Runtime state: `pipeline/status|reports|manifests|logs/` (git-ignored)
- Sources: `curriculum/<id>.sent.md` → `src/data/scripts/<id>.json` → `src/data/lessons/<id>.fr.json`
- Outputs: `out/films/<id>-fr-final.mp4`, `public/assets/covers/<id>.png`
