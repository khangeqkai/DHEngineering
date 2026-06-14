@echo off
cd /d "%~dp0"
echo.
echo ================================
echo   Seeding Mock Data
echo ================================
echo.
echo WARNING: This will WIPE all existing data and create mock data.
echo.
set /p confirm=Are you sure? (y/n):
if /i not "%confirm%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)
echo.
node server/scripts/seed-mock-data.js %*
echo.
pause
