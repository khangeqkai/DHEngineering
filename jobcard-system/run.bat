@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ================================
echo   Job Card System Launcher
echo ================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found.
    echo.
    echo Please install Node.js 18+ from:
    echo   https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check Node version
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a

node -e "if(process.versions.node.split('.')[0]<18){process.exit(1)}"
if %errorlevel% neq 0 (
    echo ERROR: Node.js 18+ required.
    for /f %%v in ('node -v') do echo Found: %%v
    echo.
    echo Please upgrade from: https://nodejs.org
    pause
    exit /b 1
)

for /f %%v in ('node -v') do echo Node.js %%v detected
echo.

:: Install root dependencies if needed
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
    echo.
)

:: Run setup checks
node scripts/setup.js
if %errorlevel% neq 0 (
    pause
    exit /b 1
)

:: Handle restart flag
if "%1"=="--restart" (
    echo Restarting services...
    taskkill /f /im node.exe >nul 2>nul
    timeout /t 2 /nobreak >nul
)
if "%1"=="-r" (
    echo Restarting services...
    taskkill /f /im node.exe >nul 2>nul
    timeout /t 2 /nobreak >nul
)

:: Start the application
echo Starting Job Card System...
echo   Server API: http://localhost:3000
echo   Database:   data/jobcard.db (SQLite)
echo.
echo Press Ctrl+C to stop
echo.

call npm start
