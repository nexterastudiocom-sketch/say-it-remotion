#!/bin/bash
# Say It Studio — one-click setup & launch.
# Double-click this file on macOS. First time: right-click → Open (to bypass Gatekeeper).
# It installs Node if needed, installs dependencies, and opens the Studio in your browser.
set -e
cd "$(dirname "$0")"
echo "════════════════════════════════════════════"
echo "  Say It Studio  ·  $(pwd)"
echo "════════════════════════════════════════════"

# 1) Node (install via nvm if missing) --------------------------------------
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || { echo "→ Installing nvm…"; curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; }
  . "$NVM_DIR/nvm.sh"
  command -v node >/dev/null 2>&1 || { echo "→ Installing Node LTS…"; nvm install --lts; nvm use --lts; }
fi
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
echo "✓ Node $(node -v)"

# 2) Dependencies ------------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "→ Installing dependencies (first run, ~2 min)…"
  npm install
else
  echo "✓ Dependencies installed"
fi

# 3) .env (keys) -------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Created .env from the template. Open it and paste your API keys:"
  echo "     ELEVENLABS_API_KEY, RECRAFT_API_TOKEN  (voice IDs are already built in)"
  open -e .env || true
fi

# 4) Launch ------------------------------------------------------------------
echo "→ Starting Studio at http://localhost:4599 …"
( sleep 3; open "http://localhost:4599" >/dev/null 2>&1 ) &
npm run studio
