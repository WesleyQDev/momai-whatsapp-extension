from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app_state
from api.deps import get_db
from app_cache import get_cached, set_cache
from database.models import Settings
import utils.downloader as downloader

router = APIRouter()


@router.get("/status")
async def get_status(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()

    engine_ok = downloader.check_engine_installed()
    install_info = downloader.get_installed_info()
    latest_v = get_cached("latest_llama", 300)
    if latest_v is None:
        latest_v = downloader.get_latest_llama_version()
        set_cache("latest_llama", latest_v)

    return {
        "status": "ok",
        "mode": app_state.orchestrator.llm_mode,
        "brain_ready": app_state.orchestrator.llm is not None and app_state.orchestrator.momai_graph is not None,
        "is_loading": app_state.orchestrator.is_loading,
        "setup": {
            "local_installed": engine_ok,
            "installed_version": install_info.get("version") if install_info else None,
            "latest_version": latest_v
        }
    }
