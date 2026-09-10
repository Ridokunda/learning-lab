@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node start.cjs
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" start.cjs
) else (
  echo Install Node.js 22 or newer from https://nodejs.org then open this launcher again.
  pause
  exit /b 1
)
if errorlevel 1 pause
