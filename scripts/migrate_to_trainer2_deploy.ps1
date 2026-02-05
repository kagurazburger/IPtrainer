$src = "E:\AppDev\live-memory-trainer-v8.0"
$dst = "E:\AppDev\trainer2_deploy_clean"

if (Test-Path $dst) {
    Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $dst | Out-Null

# Copy top-level files
$items = @('package.json','README.md','index.html','tsconfig.json','vite.config.ts','netlify.toml','types.ts','.gitignore')
foreach ($i in $items) {
    $p = Join-Path $src $i
    if (Test-Path $p) { Copy-Item $p -Recurse -Force -Destination $dst }
}

# Copy directories
$dirs = @('src','public','docs','decks')
foreach ($d in $dirs) {
    $psrc = Join-Path $src $d
    $pdst = Join-Path $dst $d
    if (Test-Path $psrc) { robocopy $psrc $pdst /MIR | Out-Null }
}

# Remove known unwanted folders if present
$removables = @('scripts','.github','venv*','venv311','output','backend','dist','static_deploy')
foreach ($r in $removables) {
    $path = Join-Path $dst $r
    if (Test-Path $path) { Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue }
}

# Remove any secret scripts
$secretScripts = @(
    (Join-Path $dst 'scripts\enable_pages.ps1'),
    (Join-Path $dst 'scripts\push_main.ps1')
)
foreach ($s in $secretScripts) { if (Test-Path $s) { Remove-Item $s -Force -ErrorAction SilentlyContinue } }

Write-Output "MIGRATE_DONE"
