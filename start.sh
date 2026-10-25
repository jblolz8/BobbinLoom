#!/usr/bin/env bash
# BobbinLoom — build the client bundle, start the production server, and open the default browser.
# Works on Windows (git-bash/MSYS), Linux, macOS, and Termux (Android).
# Serves UI + API on 127.0.0.1:8787 by default (localhost only); set HOST=0.0.0.0 in .env for LAN/VPN access.

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
# 1. Read PORT / HOST from .env (if present) and stop any previous
#    instance on that port BEFORE rebuilding
# ------------------------------------------------------------------
APP_HOST="127.0.0.1"
APP_PORT="8787"
if [ -f .env ]; then
    ENV_HOST=$(grep -E '^[[:space:]]*HOST=' .env | tail -n 1 | cut -d'=' -f2- | tr -d '\r"'\''')
    ENV_PORT=$(grep -E '^[[:space:]]*PORT=' .env | tail -n 1 | cut -d'=' -f2- | tr -d '\r"'\''')
    [ -n "$ENV_HOST" ] && APP_HOST="$ENV_HOST"
    [ -n "$ENV_PORT" ] && APP_PORT="$ENV_PORT"
fi

if command -v fuser >/dev/null 2>&1; then
    fuser -k "${APP_PORT}/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -ti "tcp:${APP_PORT}" 2>/dev/null); do kill "$pid" 2>/dev/null || true; done
else
    # Termux fallback (procps ships pkill)
    pkill -f "tsx src/server/index.ts" 2>/dev/null || true
fi

# ------------------------------------------------------------------
# 2. Fresh-clone safeguard: install dependencies if node_modules is missing
# ------------------------------------------------------------------
if [ ! -d node_modules ]; then
    echo
    echo "First-time setup: node_modules not found, installing dependencies..."
    npm install || {
        echo
        echo "[FAIL] npm install failed. Check your network connection or run ./update.sh."
        exit 1
    }
fi

# ------------------------------------------------------------------
# 3. Build the client bundle
# ------------------------------------------------------------------
echo
echo "Building client bundle..."
npm run build || {
    echo
    echo "[FAIL] Client build failed — see the output above."
    echo "       Server was not started."
    exit 1
}

# ------------------------------------------------------------------
# 4. Verify critical runtime files exist
# ------------------------------------------------------------------
[ -f data/settings.json ]       || echo "[WARN] data/settings.json not found — API calls may fail."
[ -f data/prompt-presets.json ] || echo "[WARN] data/prompt-presets.json not found — presets won't load."

# ------------------------------------------------------------------
# 5. Start the server and open the default browser once ready
# ------------------------------------------------------------------
echo
echo "============================================"
echo "  BobbinLoom is starting"
echo "  http://localhost:${APP_PORT}   (bound to ${APP_HOST}:${APP_PORT})"
echo "  (Use ./toggle_listen_server.sh to toggle LAN/VPN access)"
echo "  Opening default browser..."
echo "  Press Ctrl+C to stop."
echo "============================================"
echo

OPEN_BROWSER=1 exec npm start
