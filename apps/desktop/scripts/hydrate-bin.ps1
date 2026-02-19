# Automation to prepare the portable binaries for MomAI build
Set-Location $PSScriptRoot
$binDir = Join-Path (Join-Path $PSScriptRoot "..") "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir }

# Kill any running uv processes to avoid "File in use" errors
Get-Process "uv" -ErrorAction SilentlyContinue | Stop-Process -Force

# Helper: retry Remove-Item for locked files
function Remove-WithRetry {
    param([string]$Path, [int]$MaxRetries = 5, [int]$DelayMs = 1000)
    for ($i = 0; $i -lt $MaxRetries; $i++) {
        try {
            Remove-Item -Recurse -Force $Path -ErrorAction Stop
            return $true
        } catch {
            Write-Host "[MomAI] File locked, retrying in $($DelayMs)ms... ($($i+1)/$MaxRetries)" -ForegroundColor Yellow
            Start-Sleep -Milliseconds $DelayMs
        }
    }
    Write-Warning "[MomAI] Could not remove $Path after $MaxRetries retries"
    return $false
}

# 1. Download UV (skip if already present)
$uvExe = Join-Path $binDir "uv.exe"
if (Test-Path $uvExe) {
    Write-Host "[MomAI] UV already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading UV..." -ForegroundColor Cyan
    $uvUrl = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip"
    $uvZip = Join-Path $binDir "uv.zip"
    try {
        Get-ChildItem $binDir -Filter "uv*.exe" | Remove-Item -Force -ErrorAction SilentlyContinue

        curl.exe -L $uvUrl -o "$uvZip"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }

        Expand-Archive -Path $uvZip -DestinationPath $binDir -Force
        Remove-Item $uvZip -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "[MomAI] Failed to download or extract UV: $($_.Exception.Message)"
    }
}

# 2. Download Portable Python (skip if already present)
$targetPython = Join-Path $binDir "python"
$pythonExe = Join-Path $targetPython "python.exe"
if (Test-Path $pythonExe) {
    Write-Host "[MomAI] Python already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading Portable Python 3.12..." -ForegroundColor Cyan
    $pyUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8%2B20250115-x86_64-pc-windows-msvc-shared-install_only.tar.gz"
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
    if (Test-Path $pyExtractDir) { Remove-WithRetry $pyExtractDir }
    New-Item -ItemType Directory -Path $pyExtractDir | Out-Null

    # Use native tar.exe
    tar -xzf "$pyTar" -C "$pyExtractDir"
    Remove-Item $pyTar -ErrorAction SilentlyContinue

    # Move the actual python folder to bin/python
    $extractedPath = Join-Path $pyExtractDir "python"

    if (Test-Path $extractedPath) {
        if (Test-Path $targetPython) { Remove-WithRetry $targetPython }
        Move-Item -Path $extractedPath -Destination $targetPython -Force
        Write-Host "[MomAI] Python ready in $targetPython" -ForegroundColor Green
    } else {
        Write-Error "[MomAI] Extraction failed: $extractedPath not found."
        Get-ChildItem "$pyExtractDir"
    }

    Remove-Item -Recurse -Force $pyExtractDir -ErrorAction SilentlyContinue
}

# 3. Download Visual C++ Redistributable (skip if already present)
$vcExe = Join-Path $binDir "vc_redist.x64.exe"
if (Test-Path $vcExe) {
    Write-Host "[MomAI] VC Redist already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading Visual C++ Redistributable..." -ForegroundColor Cyan
    $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    try {
        curl.exe -L $vcUrl -o "$vcExe"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }
        Write-Host "[MomAI] VC Redist ready in $vcExe" -ForegroundColor Green
    } catch {
        Write-Warning "[MomAI] Failed to download VC Redist: $($_.Exception.Message)"
    }
}

Write-Host "[MomAI] Hydration complete! UV, Python and VC Redist are ready in apps/desktop/bin" -ForegroundColor Green
