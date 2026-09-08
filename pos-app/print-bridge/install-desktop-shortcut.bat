@echo off
REM Creates Desktop shortcut to POS-Print-Bridge.bat
REM (POS-Print-Bridge.bat also creates this automatically on first run)
setlocal EnableExtensions
cd /d "%~dp0"

set "TARGET=%~dp0POS-Print-Bridge.bat"
set "SHORTCUT=%USERPROFILE%\Desktop\POS Print Bridge.lnk"

if not exist "%TARGET%" (
  echo [ERROR] Missing POS-Print-Bridge.bat
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 1; $s.Description = 'Start Seoul Prague POS Print Bridge'; $s.Save()"

if exist "%SHORTCUT%" (
  echo.
  echo Created: %SHORTCUT%
  echo Double-click "POS Print Bridge" on your Desktop to start the bridge.
  echo.
) else (
  echo [ERROR] Could not create shortcut.
  echo.
)
pause
