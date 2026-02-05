@echo off
chcp 65001 >nul 2>&1
echo Checking paths in config.json...
echo.

cd /d "%~dp0"

if not exist "config.json" (
    echo [X] config.json not found!
    pause
    exit /b 1
)

echo Reading config.json...
echo.

python -c "import json; c=json.load(open('config.json', 'r', encoding='utf-8')); [print(f'{k}: {v}') for k,v in c.items()]"

echo.
echo Checking if paths exist...
echo.

python -c "import json, os; c=json.load(open('config.json', 'r', encoding='utf-8')); paths=[('whisper_script', c.get('whisper_script')), ('llama_cli_path', c.get('llama_cli_path')), ('llama_gguf_path', c.get('llama_gguf_path'))]; [print(f'[OK] {k}: {v}') if os.path.exists(v) else print(f'[X] {k}: {v} (NOT FOUND)') for k,v in paths]"

echo.
echo Done. Fix any [X] paths in config.json
pause
