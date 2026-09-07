@echo off
title Register POS Print Bridge one-click protocol
cd /d "%~dp0"

REM Lets the POS web app open:  pos-print-bridge://start
REM which launches start-bridge.bat without browsing to the folder.

set "BAT=%~dp0start-bridge.bat"
set "BAT=%BAT:\=\\%"

reg add "HKCU\Software\Classes\pos-print-bridge" /ve /d "URL:POS Print Bridge Protocol" /f >nul
reg add "HKCU\Software\Classes\pos-print-bridge" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\pos-print-bridge\DefaultIcon" /ve /d "%%SystemRoot%%\System32\shell32.dll,137" /f >nul
reg add "HKCU\Software\Classes\pos-print-bridge\shell\open\command" /ve /d "\"%~dp0start-bridge.bat\"" /f >nul

echo.
echo Registered protocol: pos-print-bridge://start
echo From the POS alert popup you can press "Start bridge" once.
echo Windows may ask "Open POS Print Bridge?" — choose Always allow / Open.
echo.
echo Also run install-desktop-shortcut.bat for a Desktop icon.
echo.
pause
