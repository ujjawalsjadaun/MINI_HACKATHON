@echo off
rem Stops UniSeva Portal from starting with Windows. A copy that is already running keeps running
rem until you close its window.
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\UniSeva Portal.lnk"
if exist "%LINK%" (
  del "%LINK%"
  echo UniSeva Portal will no longer start with Windows.
) else (
  echo Automatic start was not turned on.
)
ping -n 6 127.0.0.1 >nul
