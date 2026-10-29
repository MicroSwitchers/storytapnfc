@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 prepare_examples.py
) else (
  python prepare_examples.py
)
pause
