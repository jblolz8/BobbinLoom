#!/usr/bin/env bash
# BobbinLoom — production start (verify deps + client build, then serve)
# Works on Windows (git-bash/MSYS), Linux, macOS, and Termux (Android).
# Serves UI + API on 127.0.0.1:8787 by default (localhost only); set HOST=0.0.0.0 in .env for LAN/VPN access.
# Usage: ./start.sh [--force|-f] [--rebuild|-r] [--reinstall] [--no-install] [--no-build] [--check]
#   Dependencies and the client bundle are checked first and only rebuilt when
#   something actually changed. Use ./update.sh to force the whole refresh.

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
# 1. --check is a dry run: report the decisions and stop. Nothing is
#    touched — no port kill, no build, no server.
# ------------------------------------------------------------------
case " $* " in
    *" --check "*) node scripts/ensure-ready.mjs "$@"; exit 0 ;;
esac

# ------------------------------------------------------------------
# 2. Stop any previous instance on port 8787 BEFORE rebuilding: a running
#    server can hold dist/ open on Windows, which fails the bundle swap.
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
# 3. Install dependencies / build the client, but only if stale
# ------------------------------------------------------------------
echo "Checking dependencies and the client build..."
node scripts/ensure-ready.mjs "$@" || {
    echo
    echo "[FAIL] The project could not be prepared — see the message above."
    echo "       Nothing was started."
    exit 1
}

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
