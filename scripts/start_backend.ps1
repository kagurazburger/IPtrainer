$root = "E:\AppDev\live-memory-trainer-v8.0"
$backendDir = Join-Path $root 'backend'
if (Test-Path (Join-Path $backendDir 'venv311\Scripts\python.exe')) { $py = Join-Path $backendDir 'venv311\Scripts\python.exe' }
elseif (Test-Path (Join-Path $backendDir '.venv\Scripts\python.exe')) { $py = Join-Path $backendDir '.venv\Scripts\python.exe' }
else { $py = 'python' }
$cmd = "cd '$backendDir'; & '$py' -m uvicorn main:app --reload --port 8000"
Start-Process powershell -ArgumentList '-NoExit','-Command',$cmd
Write-Output 'Started backend (uvicorn) in a new PowerShell window.'
