import subprocess
import os
import time
import requests
import logging
import ctypes
from pathlib import Path
from huggingface_hub import hf_hub_download
from langchain_openai import ChatOpenAI

# Configure logger
logger = logging.getLogger("uvicorn.error")

# Global variable
server_process = None

# --- Windows Job Object Support ---
# This ensures that if the Python process dies (crash/kill), 
# Windows automatically kills the llama-server.
if os.name == 'nt':
    try:
        job_handle = ctypes.windll.kernel32.CreateJobObjectW(None, None)

        # JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [('ReadOperationCount', ctypes.c_ulonglong),
                        ('WriteOperationCount', ctypes.c_ulonglong),
                        ('OtherOperationCount', ctypes.c_ulonglong),
                        ('ReadTransferCount', ctypes.c_ulonglong),
                        ('WriteTransferCount', ctypes.c_ulonglong),
                        ('OtherTransferCount', ctypes.c_ulonglong)]

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_longlong),
                        ('PerJobUserTimeLimit', ctypes.c_longlong),
                        ('LimitFlags', ctypes.c_ulong),
                        ('MinimumWorkingSetSize', ctypes.c_size_t),
                        ('MaximumWorkingSetSize', ctypes.c_size_t),
                        ('ActiveProcessLimit', ctypes.c_ulong),
                        ('Affinity', ctypes.c_size_t),
                        ('PriorityClass', ctypes.c_ulong),
                        ('SchedulingClass', ctypes.c_ulong)]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', JOBOBJECT_BASIC_LIMIT_INFORMATION),
                        ('IoInfo', IO_COUNTERS),
                        ('ProcessMemoryLimit', ctypes.c_size_t),
                        ('JobMemoryLimit', ctypes.c_size_t),
                        ('PeakProcessMemoryUsed', ctypes.c_size_t),
                        ('PeakJobMemoryUsed', ctypes.c_size_t)]

        # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = 0x2000

        ret = ctypes.windll.kernel32.SetInformationJobObject(
            job_handle,
            9,  # JobObjectExtendedLimitInformation
            ctypes.byref(info),
            ctypes.sizeof(info)
        )
        if not ret:
            logger.warning(
                "[local_model] Failed to configure Job Object (SetInformationJobObject)")

    except Exception as e:
        logger.warning(f"[local_model] Error creating Job Object: {e}")
        job_handle = None
else:
    job_handle = None


import utils.downloader as downloader
from database.models import SessionLocal, Settings

def get_paths():
    """
    Returns the paths for binaries and models based on the installed backend.

    Returns:
        dict: Paths for 'exe', 'models' and the detected 'backend'.
    """
    # Aponta para apps/core (dois níveis acima de ai/providers/)
    base_dir = Path(__file__).parent.parent.parent
    
    # Fetch user preference from database
    db = SessionLocal()
    settings = db.query(Settings).first()
    preferred_backend = settings.local_backend if settings else "auto"
    db.close()
    
    backend = "cpu" # Default fallback
    
    if preferred_backend != "auto":
        # If user chose a specific one, try to use it
        if downloader.check_engine_installed(preferred_backend):
            backend = preferred_backend
        else:
            # If preferred is not installed, find the best available
            install_info = downloader.get_installed_info()
            backend = install_info.get("backend", "cpu")
    else:
        # Auto mode: find info on the best installed build
        install_info = downloader.get_installed_info()
        backend = install_info.get("backend", "cpu")
    
    exe_path = base_dir / "bin" / backend / "llama-server.exe"
    
    # Fallback if manifest points to a non-existent physical path
    if not exe_path.exists():
        for b in ["cuda", "vulkan", "cpu"]:
            p = base_dir / "bin" / b / "llama-server.exe"
            if p.exists():
                exe_path = p
                backend = b
                break

    return {
        "exe": exe_path,
        "models": base_dir / "models",
        "backend": backend
    }


def stop_server():
    """Stops the llama-server if it is currently running."""
    global server_process
    if server_process:
        logger.info("[local_model] Stopping previous Llama.cpp server...")
        try:
            # Try to terminate gracefully
            server_process.terminate()
            # Give 2 seconds to clean up
            server_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            logger.warning("[local_model] Forcing server kill...")
            # Force kill
            try:
                server_process.kill()
                server_process.wait(timeout=1)
            except:
                pass
        except Exception as e:
            logger.error(f"[local_model] Error stopping process: {e}")

        server_process = None


def load_model(repo_id: str, filename: str, on_progress=None) -> ChatOpenAI | None:
    """
    Downloads and starts the llama-server with the specified model.

    Args:
        repo_id (str): HuggingFace repository ID.
        filename (str): Model filename (.gguf).
        on_progress (callable, optional): Callback for progress reporting.

    Returns:
        ChatOpenAI | None: A LangChain ChatOpenAI instance pointing to local server.
    """
    global server_process

    def report(msg):
        if on_progress:
            on_progress(msg)
        logger.info(f"[local_model] {msg}")

    stop_server()

    try:
        paths = get_paths()

        report(f"Checking model {filename}...")
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=paths['models'],
            local_dir_use_symlinks=False
        )
        
        abs_model_path = str(Path(model_path).resolve())
        abs_exe_path = str(paths['exe'].resolve())

        if not paths['exe'].exists():
            report("ERROR: llama-server.exe not found!")
            raise FileNotFoundError("Local engine (llama-server) not found. Please install it in settings.")

        cmd = [
            abs_exe_path,
            "-m", abs_model_path,
            "--port", "8080",
            "--ctx-size", "8192",
            "--n-gpu-layers", "99",
            "--parallel", "1",
            "--flash-attn", "on",
            "--cache-prompt",
            "--mlock",
            "--no-mmap"
        ]

        report("Starting server process...")
        
        # Log llama-server output for debugging
        llama_log_path = Path(__file__).parent / "llama_server.log"
        llama_log_file = open(llama_log_path, "w", encoding="utf-8")

        server_process = subprocess.Popen(
            cmd,
            stdout=llama_log_file,
            stderr=llama_log_file,
            encoding="utf-8",
            errors="replace",
            creationflags=0
        )

        # Assign to Job Object (Windows Magic)
        if job_handle and server_process:
            try:
                perm = ctypes.windll.kernel32.AssignProcessToJobObject(
                    job_handle,
                    ctypes.c_void_p(server_process._handle)
                )
                if not perm:
                    logger.warning("[local_model] Failed AssignProcessToJobObject")
            except Exception as e:
                logger.warning(f"[local_model] Error assigning Job: {e}")

        # Healthcheck Loop
        report("Waiting for network initialization (Healthcheck)...")
        for i in range(120): # 120 * 0.5 = 60s
            if server_process.poll() is not None:
                # Server died, check log
                try:
                    with open(llama_log_path, "r", encoding="utf-8") as f:
                        log_content = f.read()[-500:] 
                    report(f"Server died unexpectedly! Log:\n{log_content}")
                except:
                    report("Server died unexpectedly and log could not be read.")
                return None
            try:
                if requests.get("http://127.0.0.1:8080/health", timeout=0.5).status_code == 200:
                    report("Local server ready and connected!")
                    return ChatOpenAI(
                        base_url="http://127.0.0.1:8080/v1",
                        api_key="sk-none",
                        model="gpt-4o",
                        temperature=0.7,
                        streaming=True
                    )
            except:
                pass

            if i % 10 == 0 and i > 0:
                report(f"Loading... ({i//2}s elapsed)")
            time.sleep(0.5)

        report("Startup timeout reached.")
        stop_server()
        return None

    except Exception as e:
        report(f"Critical error: {str(e)}")
        stop_server()
        return None

