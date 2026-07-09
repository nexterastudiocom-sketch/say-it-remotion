# Say It — Project State & Handoff

Read this first when opening the project on a new machine (or in a fresh Claude Code session).
This is the "Say It" multilingual language-learning YouTube pipeline (French A1 first).

## What it is
Remotion (React/TS) renders 4K lesson videos. A local **studio** web app drives the whole
pipeline: write/generate a transcript → ElevenLabs voices → Recraft images → 4K film → cover.

## New-device setup
1. **Node** (this project needs it; install via nvm if the machine has none):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   # reopen the terminal, then:
   nvm install --lts
   ```
2. **Install deps:** `npm install`
3. **Create `.env`** (NOT in git — copy it from the old machine or re-enter the keys). Required vars:
   ```
   ELEVENLABS_API_KEY=            ELEVENLABS_MODEL=eleven_v3
   ELEVENLABS_VOICE_FR_WOMAN=     ELEVENLABS_VOICE_FR_MAN=
   ELEVENLABS_VOICE_EN_MAN=       ELEVENLABS_VOICE_EN_WOMAN=
   RECRAFT_API_TOKEN=            RECRAFT_STYLE=digital_illustration
   RECRAFT_STYLE_ID=82b9cd4a-3c6b-423b-a100-410c3c22d392   # the locked house style
   ANTHROPIC_API_KEY=           ANTHROPIC_MODEL=claude-opus-4-8
   ```
   (See `.env.example` for the annotated list.)
4. **Run the studio:** `npm run studio` → open http://localhost:4599
   - First render downloads a headless Chromium (needs network).

## The studio (localhost:4599)
- **Projects** — history; each project = language + level + cover + rendered video.
- **Languages** — editable color packages (`config/languages.json`), the constant image style, and the transcript sample.
- **Generate** — words + sentences → Claude Opus 4.8 drafts a full transcript in the sample's format.
- **Editor** — transcript + per-clip play/edit/regenerate (writes back to the transcript) + incremental Build + Render.
- **Cover** — Warm-Spark thumbnail: pick an image + title → render 1280×720 PNG.

## Command-line pipeline (what the studio calls)
```bash
npm run lesson -- 1        # build base slides from the workbook (curriculum/*.xlsx)
npm run lesson:sent        # parse curriculum/lesson-01.sent.md + generate audio + bake timings
npx remotion render src/index.ts Lesson-01-FR out/films/Lesson-01-FR.mp4
npm run images             # regenerate per-segment images (Recraft, locked style)
```
Authoring format spec: **`curriculum/TRANSCRIPT_AUTHORING_GUIDE.md`** (hand this to Claude to write lessons).

## Key facts (don't relearn these)
- **Locked image style_id:** `82b9cd4a-3c6b-423b-a100-410c3c22d392` (Recraft; fused 3D+gouache).
- **Voices:** one French voice (woman) — `fr_man` is mapped to her; both English narrators kept. Model `eleven_v3`.
- **Two hard rules:** never the bare word **"clear"** in an audio tag (causes a cough/strain); the **French voice speaks only taught vocabulary** (no praise/filler).
- **Timing** is driven by the real audio length; pauses are explicit `⏸ PAUSE` lines in the transcript.
- Full detail lives in the Claude Code memory file `say-it-remotion.md` (see below).

## Carrying the AI memory (optional but recommended)
On the OLD machine, the durable project knowledge is in a memory file. Copy it to the new machine's
Claude Code memory directory so a fresh session already "knows" this project:
- File: `~/.claude/projects/<project-dir-slug>/memory/say-it-remotion.md` (+ the `MEMORY.md` index line).
- On the new machine it lives under the same `~/.claude/projects/.../memory/` path, keyed by the
  directory you open Claude Code in.

## Regenerating what didn't transfer
- `out/` (rendered films) and audio are gitignored — re-render / re-run `npm run lesson:sent`.
- `node_modules/` — `npm install`.
- Everything else (source, `studio-ui/`, `config/`, `curriculum/`, locked images) is in the repo.
