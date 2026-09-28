@echo off
REM Field Instruments — local dev server launcher
REM Tries: Python HTTP server → Node http-server → open in browser

echo.
echo ===========================================
echo  FIELD INSTRUMENTS — NEON GALAXY EDITION
echo  Starting local dev server on port 8080...
echo ===========================================
echo.

cd /d "%~dp0"

REM Try Python first
where py >nul 2>&1
if %errorlevel% equ 0 (
    echo [1/4] Starting Python HTTP server...
    start "" http://localhost:8080
    py -m http.server 8080 --bind 127.0.0.1
    goto :done
)

REM Try python
where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [2/4] Starting Python HTTP server...
    start "" http://localhost:8080
    python -m http.server 8080 --bind 127.0.0.1
    goto :done
)

REM Try npx http-server
where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo [3/4] Installing and starting http-server...
    start "" http://localhost:8080
    npx --yes http-server -p 8080 -c-1 --bind 127.0.0.1
    goto :done
)

echo.
echo [!] No HTTP server found.
echo Please install Python (https://python.org) or Node.js (https://nodejs.org)
echo and restart START.bat.
echo.
echo You can also run a server manually:
echo   py -m http.server 8080
echo   or
echo   npx http-server -p 8080
echo.
echo Then open: http://localhost:8080
echo.

:done
echo.
echo Server ready. Press Ctrl+C to stop.
echo.
pause
