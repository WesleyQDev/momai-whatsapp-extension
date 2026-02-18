@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================
echo    MomAI Diagnostic Tool v1.0
echo ============================================
echo.

set PASS=0
set FAIL=0
set WARN=0

echo [CHECK 1] Python Installation
echo ------------------------------
where python >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYVER=%%i
    echo [PASS] Python found: !PYVER!
    set /a PASS+=1
    
    echo !PYVER! | findstr /r "3.1[2-9] 3.[2-9][0-9]" >nul
    if !errorlevel! equ 0 (
        echo [PASS] Python version is 3.12+
        set /a PASS+=1
    ) else (
        echo [WARN] Python version may be too old. MomAI requires 3.12+
        set /a WARN+=1
    )
) else (
    echo [FAIL] Python not found in PATH
    echo        Download from: https://www.python.org/downloads/
    set /a FAIL+=1
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
    echo [WARN] VC++ Redistributable not found in registry
    echo        Some features may not work. Download from:
    echo        https://aka.ms/vs/17/release/vc_redist.x64.exe
    set /a WARN+=1
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
for /f "tokens=3" %%a in ('dir /-C %APPDATA% 2^>nul ^| findstr /C:"bytes free"') do set FREE=%%a
set /a FREE_GB=!FREE!/1024/1024/1024
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
    echo Last 20 lines of log:
    echo ------------------------------
    powershell -Command "Get-Content '!LOG_PATH!' -Tail 20"
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
        echo [PASS] Virtual environment Python is working
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
echo Press any key to exit...
pause > nul
