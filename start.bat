@echo off
title Chase X Records - server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this again.
  pause
  exit /b
)

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo First run: a .env file was created. Fill in DATABASE_URL, JWT_SECRET,
  echo GOOGLE_CLIENT_ID and the ADMIN_ details, save it, then run start.bat again.
  notepad .env
  pause
  exit /b
)

if not exist node_modules (
  echo Installing packages, this only happens once...
  call npm install
  if errorlevel 1 ( echo npm install failed. & pause & exit /b )
)

start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
echo Starting Chase X Records on http://localhost:3000  (admin: /admin)
echo Press Ctrl+C to stop.
node server/index.js
pause
