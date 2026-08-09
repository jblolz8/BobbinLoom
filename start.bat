@echo off
setlocal enabledelayedexpansion
title BobbinLoom Server
REM BobbinLoom — production start (build + serve)
REM Serves UI + API on 127.0.0.1:8787 (localhost only by default; set HOST=0.0.0.0 in .env to expose to LAN/VPN)

cd /d "%~dp0"

REM ------------------------------------------------------------------
REM 1. Clean previous build
REM ------------------------------------------------------------------
echo Cleaning previous build...
if exist dist rmdir /s /q dist 2>nul

REM ------------------------------------------------------------------
REM 2. Build the client bundle
REM ------------------------------------------------------------------
echo.
echo Building production bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] Build step failed with exit code %ERRORLEVEL%.
    echo Check the Vite output above for errors.
    pause
    goto :eof
)

REM ------------------------------------------------------------------
REM 3. Verify dist\index.html exists (retry for AV / explorer races)
REM ------------------------------------------------------------------
set RETRIES=0
:checkDist
if exist dist\index.html goto distOk
set /a RETRIES+=1
if %RETRIES% geq 5 (
    echo.
    echo [FAIL] dist\index.html was not produced after %RETRIES% attempts.
    echo.
    echo Possible causes:
    echo   - A file explorer is open in the dist\ folder
    echo   - Antivirus is scanning the build output
    echo   - Disk is full or write-protected
    echo.
    echo Try closing any explorer windows in this project and re-running.
    pause
    goto :eof
)
echo Waiting for dist\index.html ... (attempt %RETRIES%/5^)
timeout /t 1 /nobreak >nul
goto checkDist
:distOk

REM ------------------------------------------------------------------
REM 4. Kill anything already on port 8787
REM ------------------------------------------------------------------
echo.
echo Checking port 8787 ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8787 " ^| findstr "LISTENING" 2^>nul') do (
    echo Killing process %%a already listening on port 8787 ...
    taskkill /pid %%a /f 2>nul
)

REM ------------------------------------------------------------------
REM 5. Verify critical runtime files exist
REM ------------------------------------------------------------------
if not exist data\settings.json (
    echo [WARN] data\settings.json not found — API calls may fail.
)
if not exist data\prompt-presets.json (
    echo [WARN] data\prompt-presets.json not found — presets won't load.
)

REM ------------------------------------------------------------------
REM 6. Start the server
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
