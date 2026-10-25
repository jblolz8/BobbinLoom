@echo off
setlocal
title BobbinLoom Update
REM BobbinLoom — pull the latest changes from git and install/update npm dependencies.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Node.js not found in PATH.
    echo        Install it from https://nodejs.org/ and re-open this window.
    pause
    goto :eof
)

echo Updating BobbinLoom...
echo.

REM ------------------------------------------------------------------
REM 1. Pull latest changes from git
REM ------------------------------------------------------------------
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] git not found in PATH — skipping git pull.
) else (
    echo Pulling latest changes from git...
    git pull --ff-only
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [FAIL] git pull failed — see the message above.
        echo        Resolve any local branch changes or connectivity issues and re-run.
        pause
        goto :eof
    )
)

REM ------------------------------------------------------------------
REM 2. Install / update dependencies
REM ------------------------------------------------------------------
echo.
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] npm install failed — see the message above.
    pause
    goto :eof
)

echo.
echo ============================================
echo   Update complete.
echo   Run start.bat (or start.sh) to build and launch.
echo ============================================
echo.
pause
