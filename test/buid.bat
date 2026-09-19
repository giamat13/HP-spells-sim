@echo off
setlocal

echo ==========================================
echo   Harry Potter Spellbook - Build to EXE
echo   (single portable file, no installer, Electron)
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)

echo [1/3] Installing dependencies (electron + electron-builder)...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Packaging app as a single portable EXE for Windows...
call npx electron-builder --win portable
if errorlevel 1 (
    echo [ERROR] electron-builder failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Done!
echo Your app is in: dist\HP-Spellbook.exe
echo Just double-click it to run - no installation needed (it self-extracts to a temp folder at launch).
echo.
pause
