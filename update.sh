#!/usr/bin/env bash
# BobbinLoom — unconditional update: install dependencies AND rebuild the client.
# Use this after pulling changes, or on a fresh device. start.sh does the same thing
# automatically, but only when it detects something changed.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo "[FAIL] Node.js not found in PATH."
    echo "       Termux:  pkg install nodejs-lts"
    echo "       Desktop: https://nodejs.org/"
    exit 1
fi

echo "Updating BobbinLoom (dependencies + client build)..."
echo

node scripts/ensure-ready.mjs --force || {
    echo
    echo "[FAIL] Update failed — see the message above."
    echo "       The project may be in a partially updated state; re-run once the cause is fixed."
    exit 1
}

echo
echo "============================================"
echo "  Update complete."
echo "  Run ./start.sh to serve."
echo "============================================"
echo
