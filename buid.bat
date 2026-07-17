@echo off
setlocal

echo ==========================================
echo   Harry Potter Spellbook - Build to EXE
echo   (portable, no installer, Electron)
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)

echo [1/3] Installing dependencies (electron + electron-packager)...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Packaging app for Windows (portable folder, no installer)...
call npx electron-packager . "HP-Spellbook" --platform=win32 --arch=x64 --out=dist --overwrite
if errorlevel 1 (
    echo [ERROR] electron-packager failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Done!
echo Your app is in: dist\HP-Spellbook-win32-x64\HP-Spellbook.exe
echo Just double-click it to run - no installation needed.
echo.
pause
