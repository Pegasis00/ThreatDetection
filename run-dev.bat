@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Missing local virtual environment. Run setup-dev.bat first.
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Frontend dependencies are missing. Run setup-dev.bat first.
  exit /b 1
)

start "Pegasusxz Backend" cmd /k ""%CD%\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"
start "Pegasusxz Frontend" cmd /k "npm --prefix frontend run dev -- --host 0.0.0.0 --port 3000"

echo Started backend on http://localhost:8000 and frontend on http://localhost:3000
