@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js not found. Install Node.js 18+ from https://nodejs.org
  echo.
  pause
  exit /b 1
)

set "HOST=127.0.0.1"
set "PORT=4173"

echo.
echo   Starting BombMan at http://127.0.0.1:4173
echo   A browser window will open in 2 seconds.
echo   Keep this window open while playing. Press Ctrl+C to stop.
echo.

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
node server.js

echo.
echo Server stopped.
pause
