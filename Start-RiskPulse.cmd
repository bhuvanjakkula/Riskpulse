@echo off
cd /d "%~dp0riskpulse"
set RISK_LOCAL_OWNER=1
call npm run build
if errorlevel 1 exit /b 1
start "" http://127.0.0.1:4173/app
node scripts/desktop.mjs
pause
