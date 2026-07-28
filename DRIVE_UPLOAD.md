# Uploading lessons to Google Drive

The pipeline's `publish` step packages each finished lesson (a **reloadable
project zip** + the rendered video + a manifest) and uploads it to your Drive at:

```
My Drive / ClaudeAI / Youtube / French / <lesson-id> /
```

Uploads go through **rclone** (a plain Node script can't use Claude's Drive tools,
and a ~750 MB 4K video can't stream through them anyway). This is a **one-time
setup** — after it, every lesson uploads automatically when it passes its gates.

---

## 1. Install rclone (no Homebrew needed)

```bash
curl https://rclone.org/install.sh | sudo bash
# — or, without sudo:  cd ~ && curl -O https://downloads.rclone.org/rclone-current-osx-arm64.zip && unzip rclone-current-osx-arm64.zip && sudo cp rclone-*/rclone /usr/local/bin/
rclone version    # confirm it's on PATH
```

## 2. Connect your Google Drive (this is the OAuth step — only you can do it)

```bash
rclone config
```

Answer the prompts:
- `n` → **New remote**
- name → **`gdrive`**   ← use exactly this name
- storage → **`drive`** (Google Drive)
- `client_id` / `client_secret` → leave blank (press Enter)
- scope → **`1`** (full access) — needed to create folders + upload
- everything else → defaults
- *"Use auto config?"* → **`y`** → a browser opens → sign in as **sa.abdoli.k@gmail.com** and allow
- *"Configure as a Shared Drive?"* → **`n`**
- confirm → `y`, then `q` to quit

Verify it sees your Drive:
```bash
rclone lsd gdrive:ClaudeAI/Youtube/French     # should list your lesson folders
```

## 3. Point the pipeline at it

Add these to your shell (e.g. `~/.zshrc`) or prefix a command with them:
```bash
export MOSAIC_GDRIVE_REMOTE=gdrive
# MOSAIC_GDRIVE_BASE defaults to "ClaudeAI/Youtube/French" — only set to override
```

## 4. Upload

Automatic — every lesson that reaches `completed` publishes itself. To upload one
on demand (builds the bundle if needed, then uploads):
```bash
npm run lessons -- publish lesson-01
```
Expected tail:
```
✓ uploaded → gdrive:ClaudeAI/Youtube/French/lesson-01 (video + lesson-01-project.zip + manifest)
```

Without rclone or the env var, `publish` still builds + stages everything in
`pipeline/publish/<id>/` and prints what to upload — nothing is skipped silently.

---

### What lands in each Drive lesson folder
- `<id>-fr-final.mp4` — the rendered, loudness-normalized 4K video
- `<id>-project.zip` — the complete re-editable project (transcript, script,
  timeline, **all** audio, images, cover, config). Unzip at the repo root, add
  `.env`, `npm run studio` → the lesson reopens for editing.
- `project.json` + `README.txt` — manifest + reload instructions
