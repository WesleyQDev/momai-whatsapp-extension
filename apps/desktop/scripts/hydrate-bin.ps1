# Automation to prepare the portable binaries for MomAI build
Set-Location $PSScriptRoot
$binDir = Join-Path (Join-Path $PSScriptRoot "..") "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir }

# Kill any running uv processes to avoid "File in use" errors
Get-Process "uv" -ErrorAction SilentlyContinue | Stop-Process -Force

# 1. Download UV
Write-Host "[MomAI] Downloading UV..." -ForegroundColor Cyan
$uvUrl = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip"
$uvZip = Join-Path $binDir "uv.zip"
try {
    # Delete old uv.exe if exists
    Get-ChildItem $binDir -Filter "uv*.exe" | Remove-Item -Force -ErrorAction SilentlyContinue
    
    # Using curl for better redirect handling
    curl.exe -L $uvUrl -o "$uvZip"
    if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }
    
    Expand-Archive -Path $uvZip -DestinationPath $binDir -Force
    Remove-Item $uvZip -ErrorAction SilentlyContinue
} catch {
    Write-Warning "[MomAI] Failed to download or extract UV: $($_.Exception.Message)"
}

# 2. Download Portable Python (python-build-standalone)
Write-Host "[MomAI] Downloading Portable Python 3.12..." -ForegroundColor Cyan
$pyUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-x86_64-pc-windows-msvc-shared-pgo.tar.gz"
$pyTar = Join-Path $binDir "python.tar.gz"

try {
    curl.exe -L $pyUrl -o "$pyTar"
    if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }
} catch {
    Write-Error "[MomAI] Failed to download Python. URL: $pyUrl"
    return
}

Write-Host "[MomAI] Extracting Python..." -ForegroundColor Cyan
$pyExtractDir = Join-Path $binDir "python_raw"
if (Test-Path $pyExtractDir) { Remove-Item -Recurse -Force $pyExtractDir }
New-Item -ItemType Directory -Path $pyExtractDir

# Use native tar.exe
tar -xzf "$pyTar" -C "$pyExtractDir"
Remove-Item $pyTar -ErrorAction SilentlyContinue

# Move the actual python folder to bin/python
$extractedPath = Join-Path $pyExtractDir "python"
$targetPython = Join-Path $binDir "python"

if (Test-Path $extractedPath) {
    if (Test-Path $targetPython) { Remove-Item -Recurse -Force $targetPython }
    Move-Item -Path $extractedPath -Destination $targetPython
    Write-Host "[MomAI] Python ready in $targetPython" -ForegroundColor Green
} else {
    Write-Error "[MomAI] Extraction failed: $extractedPath not found."
    ls "$pyExtractDir"
}

Remove-Item -Recurse -Force $pyExtractDir -ErrorAction SilentlyContinue

Write-Host "[MomAI] Hydration complete! UV and Python are ready in apps/desktop/bin" -ForegroundColor Green
