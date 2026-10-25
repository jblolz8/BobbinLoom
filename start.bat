@echo off
setlocal
title BobbinLoom Server
REM BobbinLoom — build the client bundle, start the production server, and open the default browser.
REM Serves UI + API on 127.0.0.1:8787 (localhost only by default; set HOST=0.0.0.0 in .env to expose to LAN/VPN)

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
REM 1. Read PORT / HOST from .env (if present) and stop anything already
REM    on that port BEFORE rebuilding: on Windows a running server can
REM    hold dist\ open, which fails the bundle build.
REM ------------------------------------------------------------------
set APP_HOST=127.0.0.1
set APP_PORT=8787
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if /i "%%a"=="HOST" set APP_HOST=%%b
        if /i "%%a"=="PORT" set APP_PORT=%%b
    )
)

echo Checking port %APP_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%APP_PORT% " ^| findstr "LISTENING" 2^>nul') do (
    echo Stopping process %%a already listening on port %APP_PORT%...
    taskkill /pid %%a /f 2>nul
)

REM ------------------------------------------------------------------
REM 2. Fresh-clone safeguard: install dependencies if node_modules is missing
REM ------------------------------------------------------------------
if not exist node_modules\ (
    echo.
    echo First-time setup: node_modules not found, installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [FAIL] npm install failed. Check your network connection or run update.bat.
        pause
        goto :eof
    )
)

REM ------------------------------------------------------------------
REM 3. Build the client bundle
REM ------------------------------------------------------------------
echo.
echo Building client bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] Client build failed — see the output above.
    echo        Server was not started.
    pause
    goto :eof
)

REM ------------------------------------------------------------------
REM 4. Verify critical runtime files exist
REM ------------------------------------------------------------------
if not exist data\settings.json (
    echo [WARN] data\settings.json not found — API calls may fail.
)
if not exist data\prompt-presets.json (
    echo [WARN] data\prompt-presets.json not found — presets won't load.
)

REM ------------------------------------------------------------------
REM 5. Start the server and open the default browser once ready
REM ------------------------------------------------------------------
echo.
echo ============================================
echo   BobbinLoom is starting
echo   http://localhost:%APP_PORT%  (bound to %APP_HOST%:%APP_PORT%)
echo   (Use toggle_listen_server.bat to toggle LAN/VPN access)
echo   Opening default browser...
echo   Press Ctrl+C to stop.
echo ============================================
echo.

set OPEN_BROWSER=1
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
