#!/usr/bin/env bash
# BobbinLoom — pull the latest changes from git and install/update npm dependencies.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo "[FAIL] Node.js not found in PATH."
    echo "       Termux:  pkg install nodejs-lts"
    echo "       Desktop: https://nodejs.org/"
    exit 1
fi

echo "Updating BobbinLoom..."
echo

# ------------------------------------------------------------------
# 1. Pull latest changes from git
# ------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
    echo "[WARN] git not found in PATH — skipping git pull."
else
    echo "Pulling latest changes from git..."
    git pull --ff-only || {
        echo
        echo "[FAIL] git pull failed — see the message above."
        echo "       Resolve any local branch changes or connectivity issues and re-run."
        exit 1
    }
fi

# ------------------------------------------------------------------
# 2. Install / update dependencies
# ------------------------------------------------------------------
echo
echo "Installing dependencies..."
npm install || {
    echo
    echo "[FAIL] npm install failed — see the message above."
    exit 1
}

echo
echo "============================================"
echo "  Update complete."
echo "  Run ./start.sh to build and launch."
echo "============================================"
echo
