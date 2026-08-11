@echo off
title POS Print Bridge
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed on this PC.
  echo 1. Download LTS from https://nodejs.org
  echo 2. Install, then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo Starting print bridge...
echo Keep this window open.
echo.
node server.mjs
echo.
echo Bridge stopped.
pause
