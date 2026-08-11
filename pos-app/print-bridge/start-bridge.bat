@echo off
title POS Print Bridge
cd /d "%~dp0"

echo.
echo Starting print bridge (no Node.js needed)...
echo Keep this window open while the restaurant is open.
echo.

REM Prefer PowerShell bridge (built into Windows)
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
echo Could not start bridge.
echo This PC needs PowerShell (normal on Windows) or Node.js.
echo.
pause
exit /b 1

:done
echo.
echo Bridge stopped.
pause
