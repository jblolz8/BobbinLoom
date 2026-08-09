#!/usr/bin/env bash
# BobbinLoom — production start (build + serve)
# Works on Windows (git-bash/MSYS), Linux, macOS, and Termux (Android).
# Serves UI + API on 127.0.0.1:8787 by default (localhost only); set HOST=0.0.0.0 in .env for LAN/VPN access.
# Usage: ./start.sh [--rebuild|-r]   (force a client rebuild)

cd "$(dirname "$0")" || exit 1

# ------------------------------------------------------------------
# 0. Node.js check (Termux: pkg install nodejs-lts)
# ------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
    echo "[FAIL] Node.js not found in PATH."
    echo "       Termux:  pkg install nodejs-lts"
    echo "       Desktop: https://nodejs.org/"
    exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
    echo "[WARN] Node $NODE_MAJOR detected — BobbinLoom requires Node 18+."
    echo "       Termux: pkg install nodejs-lts"
fi

# ------------------------------------------------------------------
# 1. Install dependencies if missing (first run only — one-time cost)
# ------------------------------------------------------------------
if [ ! -x node_modules/.bin/tsx ]; then
    echo "Installing dependencies (first run — this can take a while)..."
    npm install --no-audit --no-fund --no-progress || { echo "[FAIL] npm install failed."; exit 1; }
fi

# ------------------------------------------------------------------
# 2. Build the client bundle (skip when present — Termux rebuilds are slow)
# ------------------------------------------------------------------
case "${1:-}" in
    --rebuild|-r) REBUILD=1 ;;
    *)            REBUILD=0 ;;
esac
if [ ! -f dist/index.html ] || [ "$REBUILD" = "1" ]; then
    echo "Building production bundle..."
    npm run build || { echo "[FAIL] Build step failed — check the Vite output above."; exit 1; }
else
    echo "Using existing build (dist/index.html). Run './start.sh --rebuild' to force a rebuild."
fi

# ------------------------------------------------------------------
# 3. Stop any previous instance on port 8787
# ------------------------------------------------------------------
if command -v fuser >/dev/null 2>&1; then
    fuser -k 8787/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -ti tcp:8787 2>/dev/null); do kill "$pid" 2>/dev/null || true; done
else
    # Termux fallback (procps ships pkill)
    pkill -f "tsx src/server/index.ts" 2>/dev/null || true
fi

# ------------------------------------------------------------------
# 4. Verify critical runtime files exist
# ------------------------------------------------------------------
[ -f data/settings.json ]       || echo "[WARN] data/settings.json not found — API calls may fail."
[ -f data/prompt-presets.json ] || echo "[WARN] data/prompt-presets.json not found — presets won't load."

# ------------------------------------------------------------------
# 5. Start the server
# ------------------------------------------------------------------
echo
echo "============================================"
echo "  BobbinLoom is starting"
echo "  http://localhost:8787   (this device)"
echo "  Network access: set HOST=0.0.0.0 in .env, then use <LAN-IP>:8787"
echo "  Press Ctrl+C to stop."
echo "============================================"
echo

exec npm start
