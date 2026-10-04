@echo off
rem UniSeva Portal: double-click to start the site. It installs what is missing, creates the demo
rem data on the first run, opens the browser, and restarts the site if it ever stops.
rem   start.bat               start and open the browser
rem   start.bat --background  start without opening the browser (used when starting with Windows)
setlocal
cd /d "%~dp0"
title UniSeva Portal
set "URL=http://localhost:3000"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem Already running (for example, started with Windows)? Just open it.
powershell -NoProfile -Command "try { Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo UniSeva Portal is already running at %URL%
  if /i not "%~1"=="--background" start "" "%URL%"
  exit /b 0
)

if not exist node_modules (
  echo Installing packages, this happens once...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo Could not install the packages. Check the internet connection and run this again.
    pause
    exit /b 1
  )
)

rem Open the browser as soon as the site answers.
if /i not "%~1"=="--background" start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process '%URL%'; break } catch { Start-Sleep -Seconds 1 } }"

:run
echo.
echo Starting UniSeva Portal. Keep this window open; close it to stop the site.
node server\index.js
echo.
echo The site stopped. Restarting in 5 seconds (close this window to stop it for good)...
ping -n 6 127.0.0.1 >nul
goto run
