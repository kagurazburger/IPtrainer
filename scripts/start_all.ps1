$root = "E:\AppDev\live-memory-trainer-v8.0"

# Start backend in a new PowerShell window
$backendDir = Join-Path $root 'backend'
if (Test-Path (Join-Path $backendDir 'venv311\Scripts\python.exe')) { $py = Join-Path $backendDir 'venv311\Scripts\python.exe' }
elseif (Test-Path (Join-Path $backendDir '.venv\Scripts\python.exe')) { $py = Join-Path $backendDir '.venv\Scripts\python.exe' }
else { $py = 'python' }
$backendCmd = "cd '$backendDir'; & '$py' -m uvicorn main:app --reload --port 8000"
Start-Process powershell -ArgumentList '-NoExit','-Command',$backendCmd

# Start frontend (Vite) in a new PowerShell window
$frontendCmd = "cd '$root'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit','-Command',$frontendCmd

Write-Output 'Started backend and frontend in new PowerShell windows.'
