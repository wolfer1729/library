@echo off
rem Starts the library so your phone (or tablet) can open it too.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo.
echo  Phones and tablets on your network will be able to open the library.
echo  A password stops other people on the same Wi-Fi from opening it.
echo  (This computer never needs the password.)
echo.
set /p LIBRARY_PASSWORD=Choose a password for your phone, or press Enter for none:
set HOST=0.0.0.0
echo.
echo  If Windows asks whether to allow "Node.js" through the firewall, click Allow.
echo  Keep this window open while you use the library. Close it to stop.
echo.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000/"
node server.js
pause
