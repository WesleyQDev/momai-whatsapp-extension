import platform
import os
import requests
import zipfile
import shutil
import subprocess
import json
from pathlib import Path
from datetime import datetime, timedelta

# Settings
LLAMA_VERSION = "b8082"  # Manual override (momentarily disabled updates)
BASE_URL_TEMPLATE = "https://github.com/ggerganov/llama.cpp/releases/download/{version}"
BIN_PATH = Path(__file__).parent.parent / "bin"

# Cache settings
CACHE_FILE = BIN_PATH / ".version_cache.json"
CACHE_DURATION_HOURS = 6  # Cache for 6 hours

def get_bin_dir(backend: str) -> Path:
    """Returns the specific directory for a backend."""
    return BIN_PATH / backend

def get_manifest_path(backend: str) -> Path:
    """Returns the install manifest path for a specific backend."""
    return get_bin_dir(backend) / "install_manifest.json"

def is_cache_valid() -> bool:
    """Verifica se o cache ainda é válido."""
    return True # Force valid to avoid updates

def save_version_cache(version: str):
    """Salva a versão no cache."""
    pass # Disabled

def load_version_cache() -> str:
    """Carrega a versão do cache."""
    return LLAMA_VERSION

def get_latest_llama_version():
    """
    Overridden: Momentum disables automatic updates.
    Returns the fixed LLAMA_VERSION.
    """
    return LLAMA_VERSION

def get_available_builds(version=None):
    """Returns build metadata for a specific version."""
    v = version or LLAMA_VERSION
    return {
        "cuda": {
            "label": "NVIDIA CUDA (GPU)",
            "version": v,
            "size_mb": 32,
            "description": "Maximum acceleration for modern NVIDIA GPUs.",
            "url_suffix": f"llama-{v}-bin-win-cuda-12.4-x64.zip"
        },
        "vulkan": {
            "label": "Vulkan (AMD/Intel GPU)",
            "version": v,
            "size_mb": 22,
            "description": "High performance for AMD, Intel, and NVIDIA GPUs.",
            "url_suffix": f"llama-{v}-bin-win-vulkan-x64.zip"
        },
        "cpu": {
            "label": "CPU Universal (x64)",
            "version": v,
            "size_mb": 18,
            "description": "Universal safety mode for any processor.",
            "url_suffix": f"llama-{v}-bin-win-cpu-x64.zip"
        }
    }

def kill_llama_processes():
    """Attempts to terminate any llama-server processes that might be blocking files."""
    try:
        if platform.system() == "Windows":
            subprocess.run("taskkill /F /IM llama-server.exe /T", 
                         shell=True, stderr=subprocess.PIPE, 
                         stdout=subprocess.PIPE)
        else:
            subprocess.run("pkill -f llama-server", shell=True)
    except:
        pass

def get_download_url(info, version=None):
    """Returns the download URL based on detected hardware and version."""
    v = version or LLAMA_VERSION
    base_url = BASE_URL_TEMPLATE.format(version=v)
    backend = info["backend"]
    builds = get_available_builds(v)
    suffix = builds.get(backend, builds["cpu"])["url_suffix"]
    return f"{base_url}/{suffix}"

def get_hardware_info():
    """Detects CPU and GPU details."""
    gpu_name = None
    cpu_name = platform.processor()
    backend = "cpu"
    
    try:
        if platform.system() == "Windows":
            # Detect GPU
            gpu_cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"'
            gpu_res = subprocess.run(gpu_cmd, shell=True, 
                                   stdout=subprocess.PIPE, 
                                   stderr=subprocess.PIPE, 
                                   text=True, encoding='utf-8', 
                                   errors='replace')
            if gpu_res.returncode == 0 and gpu_res.stdout.strip():
                gpu_name = gpu_res.stdout.strip().split('\n')[0]
            
            # Detect CPU
            cpu_cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name"'
            cpu_res = subprocess.run(cpu_cmd, shell=True, 
                                   stdout=subprocess.PIPE, 
                                   stderr=subprocess.PIPE, 
                                   text=True, encoding='utf-8', 
                                   errors='replace')
            if cpu_res.returncode == 0 and cpu_res.stdout.strip():
                cpu_name = cpu_res.stdout.strip().split('\n')[0]
    except Exception:
        pass
    
    # Determine best Backend
    if gpu_name:
        name_lower = gpu_name.lower()
        if "nvidia" in name_lower:
            backend = "cuda"
        elif "amd" in name_lower or "radeon" in name_lower or "intel" in name_lower:
            backend = "vulkan"
    
    return {
        "gpu_name": gpu_name,
        "cpu_name": cpu_name,
        "backend": backend,
        "arch": "x64"
    }

def save_manifest(info, version):
    """Saves an installation manifest JSON in the backend directory."""
    backend = info["backend"]
    backend_map = {
        "cuda": "CUDA (NVIDIA)",
        "vulkan": "Vulkan (AMD/Intel)",
        "cpu": "CPU (AVX2)"
    }
    
    data = {
        "version": version,
        "backend": backend,
        "build_type": backend_map.get(backend, "CPU (AVX2)"),
        "gpu": info["gpu_name"],
        "cpu": info["cpu_name"],
        "install_date": datetime.now().isoformat()
    }
    
    target_dir = get_bin_dir(backend)
    target_dir.mkdir(parents=True, exist_ok=True)
    
    with open(get_manifest_path(backend), "w") as f:
        json.dump(data, f, indent=2)

def get_gpu_details():
    """Compatibility wrapper for main.py."""
    info = get_hardware_info()
    return info["backend"], info["gpu_name"] or info["cpu_name"]

def get_installed_info(backend=None):
    """Reads the manifest for a specific backend or the best available."""
    if backend:
        path = get_manifest_path(backend)
        if path.exists():
            try:
                with open(path, "r") as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    # If not specified, try in order of preference
    for b in ["cuda", "vulkan", "cpu"]:
        info = get_installed_info(b)
        if info:
            return info
    
    return {}

def download_file(url, dest_path, progress_callback=None):
    """Downloads a file with progress reporting."""
    response = requests.get(url, stream=True, timeout=30)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    block_size = 1024 * 1024  # 1MB
    downloaded = 0
    
    with open(dest_path, 'wb') as file:
        for data in response.iter_content(block_size):
            file.write(data)
            downloaded += len(data)
            if progress_callback and total_size > 0:
                progress = int((downloaded / total_size) * 100)
                progress_callback(progress)

def setup_local_engine(progress_callback=None, forced_backend=None):
    """Sets up the local llama.cpp engine."""
    kill_llama_processes()
    
    latest_v = get_latest_llama_version()
    info = get_hardware_info()
    
    if forced_backend in ["cuda", "vulkan", "cpu"]:
        info["backend"] = forced_backend
    
    url = get_download_url(info, latest_v)
    backend = info["backend"]
    target_dir = get_bin_dir(backend)
    
    print("\n" + "="*50)
    print(" LLAMA.CPP CONFIGURATION")
    print("="*50)
    print(f" Detected CPU: {info['cpu_name']}")
    if info['gpu_name']:
        print(f" Detected GPU: {info['gpu_name']}")
    print(f"\n Target Version: {latest_v}")
    print(f" Target Architecture: {backend.upper()}")
    print(f" Destination Folder: bin/{backend}")
    print(f" File: {url.split('/')[-1]}")
    print("="*50 + "\n")
    
    target_dir.mkdir(parents=True, exist_ok=True)
    zip_path = target_dir / "llama_engine.zip"
    
    print(f"[Downloader] Starting download for {backend} version...")
    
    try:
        # Clear only the specific backend folder
        if target_dir.exists():
            for file in target_dir.glob("*"):
                if file.is_file() and file.name != "llama_engine.zip":
                    try:
                        os.remove(file)
                    except:
                        pass
        
        download_file(url, zip_path, progress_callback)
        
        print("[Downloader] Extracting binaries...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file in zip_ref.namelist():
                if file.endswith(".exe") or file.endswith(".dll"):
                    zip_ref.extract(file, target_dir)
        
        if zip_path.exists():
            os.remove(zip_path)
        
        save_manifest(info, latest_v)
        
        print(f"[Downloader] Installation completed successfully in bin/{backend}.")
        return True
        
    except Exception as e:
        print(f"[Downloader] Error during installation: {e}")
        return False

def uninstall_engine(backend=None):
    """Removes binaries for a specific backend or all of them."""
    if backend:
        target_dir = get_bin_dir(backend)
        if target_dir.exists():
            try:
                shutil.rmtree(target_dir)
                return True
            except Exception as e:
                print(f"[Downloader] Error uninstalling {backend}: {e}")
                return False
        return True
    
    # If not specified, remove the entire bin folder
    if BIN_PATH.exists():
        try:
            shutil.rmtree(BIN_PATH)
            return True
        except Exception as e:
            print(f"[Downloader] Error uninstalling all: {e}")
            return False
    
    return True

def check_engine_installed(backend=None):
    """Checks if the engine is installed for a backend or any available."""
    exe_name = "llama-server.exe" if platform.system() == "Windows" else "llama-server"
    
    if backend:
        return (get_bin_dir(backend) / exe_name).exists()
    
    # Check if at least one is installed
    for b in ["cuda", "vulkan", "cpu"]:
        if (get_bin_dir(b) / exe_name).exists():
            return True
    
    return False

def get_all_installed_backends():
    """Returns a list of all backends that have the executable installed."""
    installed = []
    exe_name = "llama-server.exe" if platform.system() == "Windows" else "llama-server"
    
    for b in ["cuda", "vulkan", "cpu"]:
        if (get_bin_dir(b) / exe_name).exists():
            installed.append(b)
    
    return installed

def clear_version_cache():
    """Limpa o cache de versão (útil para testes ou forçar atualização)."""
    if CACHE_FILE.exists():
        os.remove(CACHE_FILE)
        print("[Cache] Cache limpo com sucesso.")

def ensure_engine_installed(progress_callback=None, backend=None):
    """Verifica se o motor está instalado e, se não, inicia a instalação."""
    if not check_engine_installed(backend):
        print(f"[Downloader] Engine for {backend or 'auto'} not found. Starting automatic setup...")
        return setup_local_engine(progress_callback, forced_backend=backend)
    return True

if __name__ == "__main__":
    # Local test if script is run directly
    setup_local_engine()