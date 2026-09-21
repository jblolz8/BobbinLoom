#!/usr/bin/env bash
# BobbinLoom — unconditional update: pull from origin, install dependencies, rebuild the client.
# Use this when you want this device current. start.sh does the install/build automatically, but
# only when it detects something changed, and it never touches the network — pulling is what
# update.* is for.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo "[FAIL] Node.js not found in PATH."
    echo "       Termux:  pkg install nodejs-lts"
    echo "       Desktop: https://nodejs.org/"
    exit 1
fi

echo "Updating BobbinLoom (pull + dependencies + client build)..."
echo

node scripts/ensure-ready.mjs --pull --force || {
    echo
    echo "[FAIL] The update did not finish cleanly — see the message above."
    echo "       If it was the PULL that could not happen (offline, local commits, or edits in the"
    echo "       way of the incoming ones), the install and build still ran for the tree already on"
    echo "       disk, so this device is usable but behind origin. Sort the repository out and re-run."
    exit 1
}

echo
echo "============================================"
echo "  Update complete."
echo "  Run ./start.sh to serve."
echo "============================================"
echo
