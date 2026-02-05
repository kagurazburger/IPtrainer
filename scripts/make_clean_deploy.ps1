$root = "E:\AppDev\live-memory-trainer-v8.0"
$clean = "E:\AppDev\trainer2_deploy_clean"

if (Test-Path $clean) {
    Remove-Item $clean -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $clean | Out-Null

# Copy top-level files
$items = @('package.json','README.md','index.html','tsconfig.json','vite.config.ts','vercel.json','netlify.toml','types.ts','.gitignore')
foreach ($i in $items) {
    $p = Join-Path $root $i
    if (Test-Path $p) {
        Copy-Item $p -Recurse -Force -Destination $clean
    }
}

# Copy directories with robocopy (preserves structure)
$dirs = @('src','public','docs','decks')
foreach ($d in $dirs) {
    $psrc = Join-Path $root $d
    $pdst = Join-Path $clean $d
    if (Test-Path $psrc) {
        robocopy $psrc $pdst /MIR | Out-Null
    }
}

# Remove known unwanted folders if present
$removables = @('scripts','.github','venv*','venv311','output','backend','dist','static_deploy')
foreach ($r in $removables) {
    $path = Join-Path $clean $r
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Remove specific secret scripts if they somehow copied
$secretScripts = @(
    (Join-Path $clean 'scripts\enable_pages.ps1'),
    (Join-Path $clean 'scripts\push_main.ps1')
)
foreach ($s in $secretScripts) {
    if (Test-Path $s) { Remove-Item $s -Force -ErrorAction SilentlyContinue }
}

# Ensure no .git left
$gitdir = Join-Path $clean '.git'
if (Test-Path $gitdir) { Remove-Item $gitdir -Recurse -Force -ErrorAction SilentlyContinue }

# Init git and commit (set local identity to avoid global config requirement)
Set-Location $clean
git init -q
git config user.email "deploy@local"
git config user.name "Deploy Bot"
git add -A
try {
    git commit -m "Initial import (clean) files from local workspace, exclude secrets and envs" -q
} catch {
    Write-Output "WARNING: git commit may have failed (nothing to commit)"
}

Write-Output "CLEAN_COMMIT_DONE"
