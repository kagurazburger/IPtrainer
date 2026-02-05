$src = "E:\AppDev\live-memory-trainer-v8.0"
$dst = "E:\AppDev\trainer2_deploy_clean"

if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

# Copy backend and dist
$items = @('backend','dist')
foreach ($i in $items) {
    $p = Join-Path $src $i
    $d = Join-Path $dst $i
    if (Test-Path $p) {
        if (Test-Path $d) { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue }
        robocopy $p $d /MIR | Out-Null
    }
}

# Remove any local secrets files in backend (config.json may be safe but check)
$cfg = Join-Path $dst 'backend\config.json'
if (Test-Path $cfg) {
    try {
        $text = Get-Content $cfg -Raw
        # zero out sensitive keys if they look populated
        $text = $text -replace '"volc_asr_access_token"\s*:\s*"[^"]*"', '"volc_asr_access_token": ""'
        $text = $text -replace '"volc_asr_app_key"\s*:\s*"[^"]*"', '"volc_asr_app_key": ""'
        $text = $text -replace '"volc_llm_api_key"\s*:\s*"[^"]*"', '"volc_llm_api_key": ""'
        Set-Content -Path $cfg -Value $text -Encoding UTF8
    } catch { }
}

Write-Output "RESTORE_DONE"