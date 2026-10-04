@echo off
rem Starts UniSeva Portal automatically every time you sign in to Windows (minimised window).
rem Undo with autostart-off.bat.
setlocal
cd /d "%~dp0"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\UniSeva Portal.lnk"
powershell -NoProfile -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK); $s.TargetPath = '%~dp0start.bat'; $s.Arguments = '--background'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Description = 'Starts the UniSeva Portal site'; $s.Save()"
if errorlevel 1 (
  echo Could not turn on automatic start.
  pause
  exit /b 1
)
echo UniSeva Portal will now start by itself when you sign in to Windows.
echo Starting it now as well...
start "UniSeva Portal" /min "%~dp0start.bat" --background
echo To turn this off, run autostart-off.bat.
ping -n 6 127.0.0.1 >nul
