@echo off
setlocal
REM One-time home-access setup for the computer that runs the app.
REM Downloads Cloudflare's tunnel program, installs it as a Windows service
REM using the key from the Cloudflare tunnel page, and starts it.
REM Run once per computer. See HOME-ACCESS.md, section B.

REM Step 1: ask for the one administrator approval, then rerun ourselves.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Asking for permission to set up home access...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "EXE=%ProgramFiles%\cloudflared\cloudflared.exe"
set "URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

REM Step 2: get the tunnel program (skipped if already here).
if not exist "%EXE%" (
  echo Downloading the Cloudflare tunnel program...
  mkdir "%ProgramFiles%\cloudflared" >nul 2>&1
  curl.exe -L -s -o "%EXE%" "%URL%"
)
if not exist "%EXE%" (
  echo Could not download it. Check the internet connection and try again.
  pause
  exit /b 1
)

REM Step 3: the key. On the Cloudflare tunnel page, the Windows install
REM command ends in a long block of letters. Paste only that block.
echo.
echo On the Cloudflare tunnel page, copy the long key at the END of the
echo Windows install command (everything after "service install").
echo.
set /p TOKEN=Paste the key here and press Enter:
if "%TOKEN%"=="" (
  echo No key given. Nothing changed.
  pause
  exit /b 1
)
REM Forgive pasting the whole command instead of just the key.
set "TOKEN=%TOKEN:cloudflared.exe service install =%"
set "TOKEN=%TOKEN:cloudflared service install =%"

REM Step 4: replace any earlier tunnel on this computer, then install.
"%EXE%" service uninstall >nul 2>&1
"%EXE%" service install %TOKEN%
if %errorlevel% neq 0 (
  echo Something went wrong. Check the key and try again.
  pause
  exit /b 1
)

echo.
echo All done. The tunnel starts with Windows from now on.
echo Back in the browser the tunnel page should now say Healthy.
pause
