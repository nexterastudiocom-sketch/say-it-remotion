# Two-gate QA system

Objective, mostly-deterministic quality gates for a rendered lesson video. Every
check is a **standalone script you can run alone**; `all.mjs` just chains them.

```
build/<id>/manifest.json   ← the single source the gates read (emitted at generation)
build/<id>/asr.json        ← cached whisper pass (word timestamps + French windows)
qa/<id>.json               ← findings: {gate, severity, timestamp, issue, evidence, suggested_fix}
state/lexicon.json         ← cumulative words/phrases taught in videos 1..N (Gate A)
```

## Where the data comes from (inspected, not assumed)

- **Script text:** `curriculum/<id>.sent.md` → parsed `src/data/scripts/<id>.json` (has source `line`)
- **Timing + on-screen text:** baked `src/data/lessons/<id>.fr.json` (beats: `{src,durationInSeconds,phase,voice,text}`)
- **Render offset:** the film prepends a 4.5 s intro (`INTRO_FRAMES=135`), so **video time = 4.5 s + cumulative beat time**. The manifest bakes this in.
- **Render:** `out/films/<id>-fr-final.mp4` (override with `SAYIT_QA_VIDEO=…` to test a preview).

## Manifest (emitted in the generation step)

`node scripts/qa/manifest.mjs <id>` → `build/<id>/manifest.json`. One row per beat:
speaker, `intendedFrench`, `onScreenText` (what the slide actually shows — mirrors
the render components), `captionCheckable`, video-relative `videoStart/videoEnd`,
`sourceLine`, and assets. The generation loop (`orchestrate.mjs`) emits it right
after the timeline is baked — the only QA touch to the loop.

## GATE A — curriculum-check (pre-render, blocks render on HIGH)

`node scripts/qa/gate-a-curriculum.mjs <id> [--commit]`

Loads `state/lexicon.json` (cumulative from prior videos) and flags any French
token used in video N that was **never introduced or glossed** in-video. A vocab
slide's headword and any word the narrator puts in "quotes" count as introduced.
Slow syllable breaks ("Bon... jour") and multi-word phrases are matched correctly.
Exit **3** on a HIGH finding so the render step blocks. `--commit` appends this
video's newly-taught items to the lexicon — run it **only after the video passes**.

## GATE B — post-render, deterministic (no LLM judgment)

Shared ASR pass first (cached, keyed on the render's mtime):
`node scripts/qa/asr.mjs <id>` → `build/<id>/asr.json` (word timestamps + per-French-window French transcription).

| Script | What it does |
|---|---|
| `gate-b-pauses.mjs` | ffmpeg `silencedetect` → pause table; flags repeat-after-me gaps **< 1.2× the phrase duration** |
| `gate-b-wpm.mjs` | whisper word timestamps → **words-per-minute per segment**; flags out-of-band pacing |
| `gate-b-pronunciation.mjs` | **French ASR round-trip** on the rendered audio, diffed vs intended script → mispronunciation **candidates** (medium; systemic pattern → high) |
| `gate-b-av-sync.mjs` | samples a frame at each French caption change → **OCR** (rapidocr) → diffs vs the spoken transcript → **caption↔audio mismatch** (the "shows Bonjour while saying Au revoir" bug) |

## Run

```bash
npm run qa:manifest -- lesson-01          # emit manifest
npm run qa:gate-a -- lesson-01            # Gate A
npm run qa:asr -- lesson-01               # shared transcription (few min, cached)
npm run qa:pauses -- lesson-01            # each Gate B check, standalone
npm run qa:wpm -- lesson-01
npm run qa:pron -- lesson-01
npm run qa:av -- lesson-01
npm run qa -- lesson-01                    # or: the whole suite + summary
# test against a fast preview instead of the 4K final:
SAYIT_QA_VIDEO=out/films/lesson-01-preview.mp4 npm run qa -- lesson-01
```

## Tooling (local, no Homebrew)

- **ffmpeg** — `ffmpeg-static` npm dep (silencedetect, frame extraction).
- **whisper** — `.venv-whisper` (faster-whisper, word timestamps; no system ffmpeg needed — PyAV).
- **OCR** — `.venv-ocr` (rapidocr-onnxruntime; ONNX, no torch). Set `WHISPER_MODEL=small` for higher ASR accuracy.

`build/`, `qa/`, and the venvs are git-ignored; `state/lexicon.json` is committed.
