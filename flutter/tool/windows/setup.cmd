@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Review the error above, then retry.
  pause
  exit /b 1
)
echo.
echo Goal Hint is installed. Open it from the Start menu.
pause
