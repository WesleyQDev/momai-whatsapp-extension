@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================
echo    MomAI Diagnostic Tool v1.1
echo ============================================
echo.

set PASS=0
set FAIL=0
set WARN=0

echo [CHECK 1] System Python (Optional - uv downloads its own)
echo ------------------------------
where python >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2 delims= " %%i in ('python --version 2^>^&1') do set PYVER=%%i
    echo [INFO] System Python found: !PYVER!
    echo [INFO] (MomAI can work without this - uv manages its own Python)
) else (
    echo [INFO] No system Python found
    echo [INFO] (This is OK - MomAI will use uv to manage Python automatically)
)
echo.

echo [CHECK 2] Visual C++ Redistributable
echo ------------------------------
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" /v Installed >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=3" %%i in ('reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" /v Installed 2^>nul') do set VCINST=%%i
    if "!VCINST!"=="0x1" (
        echo [PASS] VC++ Redistributable 2015-2022 x64 installed
        set /a PASS+=1
    ) else (
        echo [WARN] VC++ Redistributable x64 status unknown
        set /a WARN+=1
    )
) else (
    reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" /v Installed >nul 2>&1
    if !errorlevel! equ 0 (
        echo [PASS] VC++ Redistributable found (WOW6432Node)
        set /a PASS+=1
    ) else (
        echo [WARN] VC++ Redistributable not found in registry
        echo        PyAudio requires this. Download from:
        echo        https://aka.ms/vs/17/release/vc_redist.x64.exe
        set /a WARN+=1
    )
)
echo.

echo [CHECK 3] User Data Directory
echo ------------------------------
set APPDATA_PATH=%APPDATA%\MomAI
if exist "!APPDATA_PATH!" (
    echo [PASS] MomAI data directory exists
    set /a PASS+=1
    
    echo Writing test file...
    echo test > "!APPDATA_PATH!\.write_test" 2>nul
    if exist "!APPDATA_PATH!\.write_test" (
        del "!APPDATA_PATH!\.write_test" >nul 2>&1
        echo [PASS] Write permission OK
        set /a PASS+=1
    ) else (
        echo [FAIL] Cannot write to data directory
        echo        Check antivirus or folder permissions
        set /a FAIL+=1
    )
) else (
    echo [INFO] MomAI data directory not created yet (first run?)
    mkdir "!APPDATA_PATH!" >nul 2>&1
    if exist "!APPDATA_PATH!" (
        echo [PASS] Created data directory successfully
        set /a PASS+=1
    ) else (
        echo [FAIL] Cannot create data directory
        echo        Check antivirus or folder permissions
        set /a FAIL+=1
    )
)
echo.

echo [CHECK 4] Disk Space
echo ------------------------------
for /f "tokens=3" %%a in ('dir /-C %APPDATA% 2^>nul ^| findstr /C:"bytes free"') do set FREE_BYTES=%%a
set FREE_GB=0
if defined FREE_BYTES (
    rem Use PowerShell for accurate calculation (handles large numbers)
    for /f %%i in ('powershell -Command "[math]::Round(!FREE_BYTES!/1GB, 1)"') do set FREE_GB=%%i
)
if !FREE_GB! geq 5 (
    echo [PASS] Sufficient disk space: !FREE_GB! GB free
    set /a PASS+=1
) else (
    echo [WARN] Low disk space: !FREE_GB! GB free
    echo        MomAI needs at least 5GB for models
    set /a WARN+=1
)
echo.

echo [CHECK 5] Previous Error Logs
echo ------------------------------
set LOG_PATH=%APPDATA%\MomAI\logs\main.log
if exist "!LOG_PATH!" (
    echo [INFO] Log file found at: !LOG_PATH!
    echo.
    echo Last 30 lines of log:
    echo ------------------------------
    powershell -Command "Get-Content '!LOG_PATH!' -Tail 30"
    echo ------------------------------
    echo.
    echo [INFO] Full log path: !LOG_PATH!
) else (
    echo [INFO] No log file found yet (first run or no errors)
)
echo.

echo [CHECK 6] Python Virtual Environment
echo ------------------------------
set VENV_PATH=%APPDATA%\MomAI\python_env
if exist "!VENV_PATH!\Scripts\python.exe" (
    echo [PASS] Virtual environment exists
    set /a PASS+=1
    
    "!VENV_PATH!\Scripts\python.exe" --version >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=2" %%i in ('"!VENV_PATH!\Scripts\python.exe" --version 2^>^&1') do set VENVVER=%%i
        echo [PASS] Virtual environment Python working: !VENVVER!
        set /a PASS+=1
    ) else (
        echo [FAIL] Virtual environment Python is broken
        echo        Try deleting: !VENV_PATH!
        set /a FAIL+=1
    )
) else (
    echo [INFO] Virtual environment not created yet (first run?)
)
echo.

echo [CHECK 7] Network Connectivity (GitHub API)
echo ------------------------------
powershell -Command "try { $r = Invoke-WebRequest -Uri 'https://api.github.com' -UseBasicParsing -TimeoutSec 5; Write-Host '[PASS] GitHub API reachable' } catch { Write-Host '[WARN] Cannot reach GitHub API - downloads may fail' }" 2>nul
if !errorlevel! equ 0 (
    set /a PASS+=1
) else (
    set /a WARN+=1
)
echo.

echo ============================================
echo    DIAGNOSTIC SUMMARY
echo ============================================
echo  PASS: !PASS!
echo  WARN: !WARN!
echo  FAIL: !FAIL!
echo ============================================
echo.

if !FAIL! gtr 0 (
    echo [CRITICAL] Some checks failed. Please fix the issues above.
    echo.
    echo Common solutions:
    echo  1. Install Python 3.12+ from python.org
    echo  2. Install VC++ Redistributable from Microsoft
    echo  3. Add MomAI folder to antivirus exceptions
    echo  4. Run MomAI as administrator
) else if !WARN! gtr 0 (
    echo [WARNING] Some checks have warnings.
    echo MomAI may work but some features might be limited.
) else (
    echo [OK] All checks passed!
    echo MomAI should work correctly on this system.
)

echo.
echo ============================================
echo If MomAI still doesn't start, check logs at:
echo %APPDATA%\MomAI\logs\main.log
echo ============================================
echo.
echo Press any key to exit...
pause > nul
