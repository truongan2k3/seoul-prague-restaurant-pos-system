@echo off
setlocal EnableExtensions
title Seoul Prague POS - Print Bridge
cd /d "%~dp0"

echo.
echo  Seoul Prague POS - Print Bridge
echo  ------------------------------
echo  Folder: %CD%
echo  Keep this window open while the restaurant is open.
echo.

REM One-time Desktop shortcut (so next time you click from Desktop)
set "SHORTCUT=%USERPROFILE%\Desktop\POS Print Bridge.lnk"
if not exist "%SHORTCUT%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%~f0'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 1; $s.Description = 'Start Seoul Prague POS Print Bridge'; $s.Save()" >nul 2>nul
  if exist "%SHORTCUT%" (
    echo Desktop shortcut created: POS Print Bridge.lnk
    echo.
  )
)

REM Prefer PowerShell bridge (built into Windows — no Node.js needed)
where powershell >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-bridge.ps1"
  goto :done
)

REM Fallback: Node.js if present
where node >nul 2>nul
if not errorlevel 1 (
  echo PowerShell not found — using Node.js fallback...
  node "%~dp0server.mjs"
  goto :done
)

echo.
echo [ERROR] Could not start bridge.
echo This PC needs PowerShell (normal on Windows) or Node.js.
echo.
pause
exit /b 1

:done
echo.
echo Bridge stopped.
pause
