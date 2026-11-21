@echo off
rem Downloads every book's text (plus fonts) so the library works without internet.
rem Safe to close and run again: it continues where it stopped.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
node scripts\download-all.js %*
echo.
pause
