@echo off
rem Starts the 3D Karaganda map in demo mode (payments are fake). Double-click to run.
rem NOTE: keep this file ASCII-only with CRLF line endings; cmd.exe mis-parses UTF-8 text in batch files.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo Starting the server... Close this window to stop the map.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8095"
node server.js --demo
echo.
echo Server stopped. If port 8095 is busy, the map is already running: open http://localhost:8095
pause
