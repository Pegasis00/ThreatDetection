@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher ^(`py`^) not found. Install Python 3.11+ and try again.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Install Node.js 20+ and try again.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating local virtual environment...
  py -3.11 -m venv .venv
)

echo Installing backend dependencies...
call ".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
call ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 exit /b 1

echo Installing frontend dependencies...
call npm --prefix frontend install
if errorlevel 1 exit /b 1

echo.
echo Setup complete.
echo Next: run-dev.bat
