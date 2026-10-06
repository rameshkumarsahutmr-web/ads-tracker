@echo off
title OllyFlix Autonomous AI Live Ad Tracker v6.0 PRO
color 0B

:MENU
cls
echo ==============================================================================
echo       OLLYFLIX AUTONOMOUS AI LIVE AD TRACKER AND STREAM SNIFFER v6.0
echo ==============================================================================
echo.
echo   [1] Launch Real-Time Web Dashboard (Browser UI + Live Video Player)
echo   [2] Fast Console Scan (CLI Mode in CMD)
echo   [3] Run Python Playlist Resolver (M3U8 Deep Validator)
echo   [4] Exit
echo.
echo ==============================================================================
echo.
choice /c 1234 /n /m "  Press [1, 2, 3, or 4]: "

if errorlevel 4 exit /b
if errorlevel 3 goto RUN_PYTHON
if errorlevel 2 goto CLI_MODE
if errorlevel 1 goto LAUNCH_WEB
goto MENU

:LAUNCH_WEB
cls
echo.
echo ==============================================================================
echo   Starting Live Web Dashboard...
echo   Opening: http://127.0.0.1:3300
echo ==============================================================================
echo.
start "" "http://127.0.0.1:3300"
node "%~dp0live_tracker.js"
echo.
pause
goto MENU

:CLI_MODE
cls
echo.
echo ==============================================================================
echo   FAST CONSOLE SCAN MODE
echo ==============================================================================
echo.
set /p "EMBED_URL=  Enter or Paste Embed / Video URL: "

if "%EMBED_URL%"=="" (
    echo.
    echo   Error: Link cannot be empty!
    timeout /t 2 >nul
    goto CLI_MODE
)

echo.
echo   Starting Deep Autonomous Audit. Please wait...
echo ------------------------------------------------------------------------------
node "%~dp0live_tracker.js" "%EMBED_URL%"
echo.
echo ==============================================================================
echo   Scan finished! Reports saved to LATEST_SCAN_REPORT.txt
echo ==============================================================================
echo.
pause
goto MENU

:RUN_PYTHON
cls
echo.
echo ==============================================================================
echo   PYTHON STREAM HUNTER AND PLAYLIST RESOLVER
echo ==============================================================================
echo.
python "%~dp0stream_hunter.py"
echo.
pause
goto MENU
