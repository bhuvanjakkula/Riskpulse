@echo off
cd /d "%~dp0riskpulse"
set RISK_LOCAL_OWNER=
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 24 or newer, then run this file again.
 pause
 exit /b 1
)
call npm run build
if errorlevel 1 (
 pause
 exit /b 1
)
start "" http://127.0.0.1:4173/
node scripts/desktop.mjs
pause
