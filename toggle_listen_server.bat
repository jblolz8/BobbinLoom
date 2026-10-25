@echo off
setlocal EnableDelayedExpansion
title BobbinLoom Listen Server Toggle
REM BobbinLoom — Toggle or configure network listen mode (.env HOST & PORT)

cd /d "%~dp0"

echo ============================================
echo   BobbinLoom Listen Server Configuration
echo ============================================
echo.

if exist .env (
    echo Current status: ON ^(.env file found^)
    echo --------------------------------------------
    for /f "usebackq delims=" %%l in (".env") do (
        echo   %%l
    )
    echo --------------------------------------------
    echo.
    set "ACTION="
    set /p "ACTION=Press [Enter] to turn OFF (remove .env), or type [E] to edit HOST/PORT: "
    if /i "!ACTION!"=="E" goto :configure
    del /f /q .env
    echo.
    echo [OFF] Removed .env. BobbinLoom will now bind to 127.0.0.1:8787 ^(localhost only^).
    echo.
    pause
    goto :eof
) else (
    echo Current status: OFF ^(Localhost only — 127.0.0.1:8787^)
    echo.
)

:configure
set "INPUT_HOST="
set "INPUT_PORT="
set /p "INPUT_HOST=Enter HOST [default: 0.0.0.0]: "
if "!INPUT_HOST!"=="" set "INPUT_HOST=0.0.0.0"

set /p "INPUT_PORT=Enter PORT [default: 8787]: "
if "!INPUT_PORT!"=="" set "INPUT_PORT=8787"

(
    echo HOST=!INPUT_HOST!
    echo PORT=!INPUT_PORT!
) > .env

echo.
echo [ON] Saved .env with:
echo   HOST=!INPUT_HOST!
echo   PORT=!INPUT_PORT!
echo.
echo Restart BobbinLoom ^(start.bat^) for changes to take effect.
echo.
pause
