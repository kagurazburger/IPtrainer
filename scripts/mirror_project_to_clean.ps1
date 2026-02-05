$src = "E:\AppDev\live-memory-trainer-v8.0"
$dst = "E:\AppDev\trainer2_deploy_clean"

Write-Output "Source: $src"
Write-Output "Destination: $dst"

# Remove existing destination
if (Test-Path $dst) {
    Write-Output "Removing existing destination..."
    Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $dst | Out-Null

# Mirror copy excluding large or local-only folders
$excludeDirs = @('.git','node_modules','venv*','venv311','.venv','trainer2_deploy_clean')
$xdArgs = $excludeDirs | ForEach-Object {"/XD","$src\\$_"}

# Build robocopy arg list
$robocmd = @($src, $dst, '/MIR') + $xdArgs + @('/R:2','/W:2')
Write-Output "Running robocopy..."
robocopy @robocmd | Out-Null

# Remove known secret scripts and vercel files in destination
$secret1 = Join-Path $dst 'scripts\enable_pages.ps1'
$secret2 = Join-Path $dst 'scripts\push_main.ps1'
if (Test-Path $secret1) { Remove-Item $secret1 -Force -ErrorAction SilentlyContinue }
if (Test-Path $secret2) { Remove-Item $secret2 -Force -ErrorAction SilentlyContinue }
$vercel1 = Join-Path $dst 'vercel.json'
$vercel2 = Join-Path $dst '.vercelignore'
if (Test-Path $vercel1) { Remove-Item $vercel1 -Force -ErrorAction SilentlyContinue }
if (Test-Path $vercel2) { Remove-Item $vercel2 -Force -ErrorAction SilentlyContinue }

# Replace absolute old path with new path in text files
$old = 'E:\\AppDev\\live-memory-trainer-v8.0'
$new = 'E:\\AppDev\\trainer2_deploy_clean'
Write-Output "Scanning and replacing occurrences of $old -> $new"
$files = Get-ChildItem -Path $dst -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -notin '.exe','.dll','.png','.jpg','.jpeg','.gif','.zip','.tgz','.tar','.woff','.woff2','.otf','.ttf' }
foreach ($f in $files) {
    try {
        $text = Get-Content $f.FullName -Raw -ErrorAction Stop
        if ($text -like "*$old*") {
            $newText = $text -replace [regex]::Escape($old), $new
            Set-Content -Path $f.FullName -Value $newText -Encoding UTF8
            Write-Output "Rewrote: $($f.FullName)"
        }
    } catch {
        # ignore binary or locked files
    }
}

# Ensure no .git directory
$gitdir = Join-Path $dst '.git'
if (Test-Path $gitdir) { Remove-Item $gitdir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Output "MIRROR_DONE"
