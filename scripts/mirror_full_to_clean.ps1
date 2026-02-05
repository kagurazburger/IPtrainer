$src = "E:\AppDev\live-memory-trainer-v8.0"
$dst = "E:\AppDev\trainer2_deploy_clean"

if (!(Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst | Out-Null
}

# Copy everything except .git and node_modules
robocopy $src $dst /E /COPY:DAT /R:2 /W:2 /XD "$src\.git" "$src\node_modules" | Out-Null

Write-Output "FULL_MIRROR_DONE"
