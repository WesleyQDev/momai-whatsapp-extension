#!/bin/bash
# MomAI Diagnostic Tool - Linux/macOS
# Run this script to check if MomAI can run correctly on your system

set -e

echo "============================================"
echo "   MomAI Diagnostic Tool v1.0 (Linux)"
echo "============================================"
echo ""
echo "NOTE: MomAI does NOT require Python to be installed."
echo "       The 'uv' tool downloads Python automatically."
echo ""

PASS=0
FAIL=0
WARN=0

# -----------------------------------------------
echo "[CHECK 1] Internet Connectivity (Required for first run)"
echo "------------------------------"
if curl -s --max-time 10 https://api.github.com > /dev/null 2>&1; then
    echo "[PASS] Internet connection OK"
    PASS=$((PASS+1))
else
    echo "[FAIL] No internet connection - uv cannot download Python"
    echo "       First run requires internet to download Python (~30MB)"
    FAIL=$((FAIL+1))
fi
echo ""

# -----------------------------------------------
echo "[CHECK 2] System Python (Optional - uv manages its own)"
echo "------------------------------"
if command -v python3 > /dev/null 2>&1; then
    PYVER=$(python3 --version 2>&1)
    echo "[INFO] System Python found: $PYVER"
    echo "[INFO] (MomAI can work without this - uv manages its own Python)"
else
    echo "[INFO] No system Python found"
    echo "[INFO] (This is OK - MomAI will use uv to manage Python automatically)"
fi
echo ""

# -----------------------------------------------
echo "[CHECK 3] Required System Libraries"
echo "------------------------------"
MISSING_LIBS=0

check_lib() {
    if ldconfig -p | grep -q "$1" > /dev/null 2>&1; then
        echo "[PASS] $1 found"
        PASS=$((PASS+1))
    else
        echo "[WARN] $1 not found (may cause issues)"
        WARN=$((WARN+1))
        MISSING_LIBS=$((MISSING_LIBS+1))
    fi
}

check_lib "libportaudio"
check_lib "libasound"

if [ "$MISSING_LIBS" -gt 0 ]; then
    echo ""
    echo "   To install missing audio libraries on Debian/Ubuntu:"
    echo "   sudo apt-get install portaudio19-dev libasound2-dev"
    echo ""
    echo "   On Fedora/RHEL:"
    echo "   sudo dnf install portaudio-devel alsa-lib-devel"
fi
echo ""

# -----------------------------------------------
echo "[CHECK 4] User Data Directory"
echo "------------------------------"
APPDATA_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/MomAI"
if [ -d "$APPDATA_PATH" ]; then
    echo "[PASS] MomAI data directory exists: $APPDATA_PATH"
    PASS=$((PASS+1))
    
    touch "$APPDATA_PATH/.write_test" 2>/dev/null
    if [ $? -eq 0 ]; then
        rm -f "$APPDATA_PATH/.write_test"
        echo "[PASS] Write permission OK"
        PASS=$((PASS+1))
    else
        echo "[FAIL] Cannot write to data directory"
        echo "       Check folder permissions"
        FAIL=$((FAIL+1))
    fi
else
    echo "[INFO] MomAI data directory not created yet (first run?)"
    mkdir -p "$APPDATA_PATH" 2>/dev/null
    if [ -d "$APPDATA_PATH" ]; then
        echo "[PASS] Created data directory successfully"
        PASS=$((PASS+1))
    else
        echo "[FAIL] Cannot create data directory"
        FAIL=$((FAIL+1))
    fi
fi
echo ""

# -----------------------------------------------
echo "[CHECK 5] Disk Space"
echo "------------------------------"
FREE_KB=$(df -k "$HOME" | awk 'NR==2 {print $4}')
FREE_GB=$(awk "BEGIN {printf \"%.1f\", $FREE_KB/1048576}")
FREE_GB_INT=$(echo "$FREE_GB" | cut -d. -f1)

if [ "$FREE_GB_INT" -ge 5 ]; then
    echo "[PASS] Sufficient disk space: ${FREE_GB} GB free"
    PASS=$((PASS+1))
else
    echo "[WARN] Low disk space: ${FREE_GB} GB free"
    echo "       MomAI needs at least 5GB for models"
    WARN=$((WARN+1))
fi
echo ""

# -----------------------------------------------
echo "[CHECK 6] Previous Error Logs"
echo "------------------------------"
LOG_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/MomAI/logs/main.log"

# Also check userData path used by Electron on Linux
ELECTRON_LOG="$HOME/.config/MomAI/logs/main.log"

if [ -f "$ELECTRON_LOG" ]; then
    echo "[INFO] Log file found at: $ELECTRON_LOG"
    echo ""
    echo "Last 30 lines of log:"
    echo "------------------------------"
    tail -n 30 "$ELECTRON_LOG"
    echo "------------------------------"
else
    echo "[INFO] No log file found yet (first run or no errors)"
fi
echo ""

# -----------------------------------------------
echo "[CHECK 7] Python Virtual Environment"
echo "------------------------------"
VENV_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/MomAI/python_env"
if [ -f "$VENV_PATH/bin/python" ]; then
    echo "[PASS] Virtual environment exists"
    PASS=$((PASS+1))
    
    VENVVER=$("$VENV_PATH/bin/python" --version 2>&1)
    echo "[PASS] Virtual environment Python working: $VENVVER"
    PASS=$((PASS+1))
elif [ -f "$VENV_PATH/bin/python3" ]; then
    echo "[PASS] Virtual environment exists"
    PASS=$((PASS+1))
    
    VENVVER=$("$VENV_PATH/bin/python3" --version 2>&1)
    echo "[PASS] Virtual environment Python working: $VENVVER"
    PASS=$((PASS+1))
else
    echo "[INFO] Virtual environment not created yet (first run?)"
fi
echo ""

# -----------------------------------------------
echo "============================================"
echo "   DIAGNOSTIC SUMMARY"
echo "============================================"
echo " PASS: $PASS"
echo " WARN: $WARN"
echo " FAIL: $FAIL"
echo "============================================"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "[CRITICAL] Some checks failed. Please fix the issues above."
    echo ""
    echo "Common solutions:"
    echo "  1. Ensure internet connection for first run"
    echo "  2. Install audio libraries: sudo apt-get install portaudio19-dev libasound2-dev"
    echo "  3. Check folder permissions"
elif [ "$WARN" -gt 0 ]; then
    echo "[WARNING] Some checks have warnings."
    echo "MomAI may work but some features might be limited."
else
    echo "[OK] All checks passed!"
    echo "MomAI should work correctly on this system."
fi

echo ""
echo "============================================"
echo "If MomAI still doesn't start, check logs at:"
echo "$HOME/.config/MomAI/logs/main.log"
echo "============================================"
