import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app_state
from api.deps import get_db
from api.schemas import InstallRequest
from database.models import Settings
import utils.downloader as downloader

router = APIRouter()


@router.get("/setup/status")
async def get_setup_status(db: Session = Depends(get_db)):
    """Verifica status detalhado da instalacao local."""

    def _get_status():
        settings = db.query(Settings).first()
        current_local_backend = settings.local_backend if settings else "auto"

        engine_ok = downloader.check_engine_installed()
        models_path = Path(__file__).parent.parent.parent / "models"
        models_ok = any(models_path.glob("*.gguf"))

        install_info = downloader.get_installed_info()
        hw_info = downloader.get_hardware_info()
        installed_backends = downloader.get_all_installed_backends()

        latest_v = downloader.get_latest_llama_version()

        return {
            "engine_installed": engine_ok,
            "models_installed": models_ok,
            "detected_hardware": hw_info.get("gpu_name") or "Nao Detectada",
            "cpu_name": hw_info.get("cpu_name"),
            "recommended_build": hw_info.get("backend"),
            "available_builds": downloader.get_available_builds(latest_v),
            "latest_version": latest_v,
            "installed_version": install_info.get("version") if install_info else None,
            "installed_build": install_info.get("build_type") if install_info else None,
            "installed_backends": installed_backends,
            "current_local_backend": current_local_backend
        }

    return await asyncio.to_thread(_get_status)


@router.post("/setup/install-engine")
async def install_engine(req: InstallRequest | None = None):
    """Inicia o download do motor Llama.cpp."""
    loop = asyncio.get_running_loop()
    forced = req.backend if req else None

    def sync_report_progress(percent: int) -> None:
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets({
                "type": "setup_progress",
                "data": {"step": "download_engine", "percent": percent}
            }),
            loop
        )

    try:
        success = await asyncio.to_thread(downloader.setup_local_engine, sync_report_progress, forced)

        if success:
            await app_state.broadcast_to_sockets({"type": "setup_complete", "data": {"step": "download_engine"}})
            return {"status": "ok"}
        return {"status": "error", "message": "Falha no download ou instalacao"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@router.delete("/setup/uninstall-engine")
async def uninstall_engine(backend: str | None = None):
    """Remove o motor local."""
    try:
        from ai.providers.local_llama import stop_server
        stop_server()
    except Exception:
        pass

    success = downloader.uninstall_engine(backend)
    if success:
        return {"status": "ok"}
    return {"status": "error", "message": "Falha ao remover arquivos"}
