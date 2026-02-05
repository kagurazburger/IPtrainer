@echo off
echo Searching for llama-cli.exe and Llama model files...
echo This may take a few minutes...
echo.

REM Search for llama-cli.exe
echo Searching for llama-cli.exe...
for /r C:\Users\%USERNAME%\Documents %%f in (llama-cli.exe) do (
    echo Found: %%f
)

for /r C:\Users\%USERNAME%\Downloads %%f in (llama-cli.exe) do (
    echo Found: %%f
)

for /r D:\ %%f in (llama-cli.exe) do (
    echo Found: %%f
)

echo.
echo Searching for .gguf model files...
for /r C:\Users\%USERNAME%\Documents %%f in (*.gguf) do (
    echo Found: %%f
)

for /r C:\Users\%USERNAME%\Downloads %%f in (*.gguf) do (
    echo Found: %%f
)

for /r D:\ %%f in (*.gguf) do (
    echo Found: %%f
)

echo.
echo Search complete!
pause
