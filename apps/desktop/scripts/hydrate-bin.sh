#!/bin/bash
set -e

# Automation to prepare the portable binaries for MomAI build on Linux/macOS
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd "$SCRIPTPATH"
BIN_DIR="../../bin"

mkdir -p "$BIN_DIR"

# 1. Download UV
echo "[MomAI] Downloading UV..."
UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-musl.tar.gz"
if [[ "$OSTYPE" == "darwin"* ]]; then
    UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-apple-darwin.tar.gz"
fi

UV_TAR="$BIN_DIR/uv.tar.gz"
curl -L "$UV_URL" -o "$UV_TAR"
tar -xzf "$UV_TAR" -C "$BIN_DIR" --strip-components=1
rm "$UV_TAR"

# 2. Download Portable Python (optional for Linux as usually bundled or handled by uv, 
# but we follow the hydration logic)
echo "[MomAI] Downloading Portable Python 3.12..."
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-x86_64-unknown-linux-gnu-install_only.tar.gz"
if [[ "$OSTYPE" == "darwin"* ]]; then
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-x86_64-apple-darwin-install_only.tar.gz"
fi

PY_TAR="$BIN_DIR/python.tar.gz"
curl -L "$PY_URL" -o "$PY_TAR"
mkdir -p "$BIN_DIR/python"
tar -xzf "$PY_TAR" -C "$BIN_DIR/python" --strip-components=1
rm "$PY_TAR"

# 3. Download Visual C++ Redistributable
echo "[MomAI] Downloading Visual C++ Redistributable..."
VC_URL="https://aka.ms/vs/17/release/vc_redist.x64.exe"
curl -L "$VC_URL" -o "$BIN_DIR/vc_redist.x64.exe"

echo "[MomAI] Hydration complete! UV, Python and VC Redist are ready in apps/desktop/bin"
