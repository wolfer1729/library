@echo off
rem Starts the Granthalaya library and opens it in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo Starting Granthalaya at http://localhost:3000  (close this window to stop it)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000/"
node server.js
pause
