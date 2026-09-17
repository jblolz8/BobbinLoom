@echo off
setlocal
title BobbinLoom Update
REM BobbinLoom — unconditional update: install dependencies AND rebuild the client.
REM Use this after pulling changes, or on a fresh device. start.bat does the same
REM thing automatically, but only when it detects something changed.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Node.js not found in PATH.
    echo        Install it from https://nodejs.org/ and re-open this window.
    pause
    goto :eof
)

echo Updating BobbinLoom (dependencies + client build)...
echo.
call node scripts\ensure-ready.mjs --force
if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] Update failed — see the message above.
    echo        The project may be in a partially updated state; re-run once the
    echo        cause is fixed.
    pause
    goto :eof
)

echo.
echo ============================================
echo   Update complete.
echo   Run start.bat (or start.sh) to serve.
echo ============================================
echo.
pause
