import platform
import shutil
import sys
from pathlib import Path

import psutil
from fastapi import APIRouter

router = APIRouter()


@router.get("/diagnostic")
async def get_diagnostic():
    """Returns system diagnostic information for debugging startup issues."""
    diagnostic = {
        "system": {
            "os": platform.system(),
            "os_version": platform.version(),
            "os_release": platform.release(),
            "architecture": platform.machine(),
            "python_version": sys.version,
            "python_path": sys.executable,
        },
        "resources": {
            "cpu_count": psutil.cpu_count(),
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "memory_available_gb": round(
                psutil.virtual_memory().available / (1024**3), 2
            ),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_total_gb": round(shutil.disk_usage(Path.home()).total / (1024**3), 2),
            "disk_free_gb": round(shutil.disk_usage(Path.home()).free / (1024**3), 2),
        },
        "checks": [],
    }

    checks = []

    python_ok = sys.version_info >= (3, 12)
    checks.append(
        {
            "name": "python_version",
            "status": "pass" if python_ok else "fail",
            "message": f"Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
            + (" (3.12+ required)" if not python_ok else ""),
        }
    )

    memory_ok = psutil.virtual_memory().available > 2 * 1024**3
    checks.append(
        {
            "name": "memory",
            "status": "pass" if memory_ok else "warn",
            "message": f"{round(psutil.virtual_memory().available / (1024**3), 1)}GB available (2GB+ recommended)",
        }
    )

    disk_ok = shutil.disk_usage(Path.home()).free > 5 * 1024**3
    checks.append(
        {
            "name": "disk_space",
            "status": "pass" if disk_ok else "warn",
            "message": f"{round(shutil.disk_usage(Path.home()).free / (1024**3), 1)}GB free (5GB+ recommended for models)",
        }
    )

    try:
        import torch

        cuda_available = torch.cuda.is_available()
        checks.append(
            {
                "name": "cuda",
                "status": "pass" if cuda_available else "warn",
                "message": "CUDA available"
                if cuda_available
                else "CUDA not available (CPU mode)",
            }
        )
    except ImportError:
        checks.append(
            {
                "name": "torch",
                "status": "warn",
                "message": "PyTorch not installed",
            }
        )

    try:
        import faster_whisper

        checks.append(
            {
                "name": "whisper",
                "status": "pass",
                "message": "faster-whisper available",
            }
        )
    except ImportError:
        checks.append(
            {
                "name": "whisper",
                "status": "warn",
                "message": "faster-whisper not installed",
            }
        )

    try:
        import kokoro

        checks.append(
            {
                "name": "tts",
                "status": "pass",
                "message": "Kokoro TTS available",
            }
        )
    except ImportError:
        checks.append(
            {
                "name": "tts",
                "status": "warn",
                "message": "Kokoro TTS not installed",
            }
        )

    try:
        import pvporcupine

        checks.append(
            {
                "name": "wake_word",
                "status": "pass",
                "message": "Porcupine wake word engine available",
            }
        )
    except ImportError:
        checks.append(
            {
                "name": "wake_word",
                "status": "warn",
                "message": "Porcupine not installed",
            }
        )

    try:
        import pyaudio

        checks.append(
            {
                "name": "audio",
                "status": "pass",
                "message": "PyAudio available",
            }
        )
    except ImportError:
        checks.append(
            {
                "name": "audio",
                "status": "fail",
                "message": "PyAudio not installed - VC++ Redistributable may be required",
            }
        )

    diagnostic["checks"] = checks

    pass_count = sum(1 for c in checks if c["status"] == "pass")
    fail_count = sum(1 for c in checks if c["status"] == "fail")
    warn_count = sum(1 for c in checks if c["status"] == "warn")

    diagnostic["summary"] = {
        "pass": pass_count,
        "fail": fail_count,
        "warn": warn_count,
        "healthy": fail_count == 0,
    }

    return diagnostic
