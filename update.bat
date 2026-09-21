@echo off
setlocal
title BobbinLoom Update
REM BobbinLoom — unconditional update: pull from origin, install dependencies, rebuild the
REM client. Use this when you want this device current. start.bat does the install/build
REM automatically, but only when it detects something changed, and it never touches the
REM network — pulling is what update.* is for.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Node.js not found in PATH.
    echo        Install it from https://nodejs.org/ and re-open this window.
    pause
    goto :eof
)

echo Updating BobbinLoom (pull + dependencies + client build)...
echo.
call node scripts\ensure-ready.mjs --pull --force
if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] The update did not finish cleanly — see the message above.
    echo        If it was the PULL that could not happen (offline, local commits, or edits
    echo        in the way of the incoming ones), the install and build still ran for the
    echo        tree already on disk, so this device is usable but behind origin. Sort the
    echo        repository out and re-run.
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
