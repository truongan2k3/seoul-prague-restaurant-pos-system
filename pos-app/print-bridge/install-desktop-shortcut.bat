@echo off
title Install POS Print Bridge Desktop Shortcut
cd /d "%~dp0"

set "SHORTCUT=%USERPROFILE%\Desktop\POS Print Bridge.lnk"
set "TARGET=%~dp0start-bridge.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 1; $s.Description = 'Start POS print bridge (keep open)'; $s.Save()"

if exist "%SHORTCUT%" (
  echo.
  echo Desktop shortcut created:
  echo   %SHORTCUT%
  echo.
  echo Double-click "POS Print Bridge" on the Desktop anytime — no need to open the folder.
  echo.
) else (
  echo Failed to create Desktop shortcut.
)

pause
