@echo off
cd /d "%~dp0"
echo Searching for Llama files...
echo.
python find_llama.py
pause
