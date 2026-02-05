$root = "E:\AppDev\live-memory-trainer-v8.0"
$cmd = "cd '$root'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit','-Command',$cmd
Write-Output 'Started frontend (Vite) in a new PowerShell window.'
