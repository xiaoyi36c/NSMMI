@echo off
rem NSMMI Launcher - double-click entry
rem ASCII only by design; all UI text lives in the ps1 (UTF-8 BOM)
if not exist "%~dp0NSMMI-Launcher.ps1" (
  echo [NSMMI] NSMMI-Launcher.ps1 not found next to this bat.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0NSMMI-Launcher.ps1" %*
