@echo off
setlocal
title BobbinLoom Server
REM BobbinLoom — production start (verify deps + client build, then serve)
REM Serves UI + API on 127.0.0.1:8787 (localhost only by default; set HOST=0.0.0.0 in .env to expose to LAN/VPN)
REM
REM Usage: start.bat [--force|-f] [--rebuild|-r] [--reinstall] [--no-install] [--no-build] [--check]
REM   Dependencies and the client bundle are checked first and only rebuilt when
REM   something actually changed. Use update.bat to force the whole refresh.

cd /d "%~dp0"

REM ------------------------------------------------------------------
REM 0. Node.js check
REM ------------------------------------------------------------------
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Node.js not found in PATH.
    echo        Install it from https://nodejs.org/ and re-open this window.
    pause
    goto :eof
)

REM ------------------------------------------------------------------
REM 1. --check is a dry run: report the decisions and stop. Nothing is
REM    touched — no port kill, no build, no server.
REM ------------------------------------------------------------------
echo %* | findstr /c:"--check" >nul
if %ERRORLEVEL% equ 0 (
    call node scripts\ensure-ready.mjs %*
    goto :eof
)

REM ------------------------------------------------------------------
REM 2. Stop anything already on port 8787 BEFORE rebuilding: on Windows a
REM    running server can hold dist\ open, which fails the bundle swap.
REM ------------------------------------------------------------------
echo Checking port 8787 ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8787 " ^| findstr "LISTENING" 2^>nul') do (
    echo Killing process %%a already listening on port 8787 ...
    taskkill /pid %%a /f 2>nul
)

REM ------------------------------------------------------------------
REM 3. Install dependencies / build the client, but only if stale
REM ------------------------------------------------------------------
echo.
echo Checking dependencies and the client build...
call node scripts\ensure-ready.mjs %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] The project could not be prepared — see the message above.
    echo        Nothing was started.
    pause
    goto :eof
)

REM ------------------------------------------------------------------
REM 3. Verify critical runtime files exist
REM ------------------------------------------------------------------
if not exist data\settings.json (
    echo [WARN] data\settings.json not found — API calls may fail.
)
if not exist data\prompt-presets.json (
    echo [WARN] data\prompt-presets.json not found — presets won't load.
)

REM ------------------------------------------------------------------
REM 4. Start the server
REM ------------------------------------------------------------------
echo.
echo ============================================
echo   BobbinLoom is starting
echo   http://localhost:8787
echo   (Network access: set HOST=0.0.0.0 in .env)
echo   Press Ctrl+C to stop.
echo ============================================
echo.

call npm start
set SERVER_EXIT=%ERRORLEVEL%

REM If we get here, the server has stopped.
echo.
if %SERVER_EXIT% neq 0 (
    echo [STOPPED] Server exited with code %SERVER_EXIT%.
    echo Check the output above for crash details.
) else (
    echo [STOPPED] Server shut down normally.
)
echo.
pause
