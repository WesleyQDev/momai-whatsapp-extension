import asyncio

from fastapi import APIRouter, BackgroundTasks

import app_state
from api.deps import require_ai_loaded
from api.schemas import InstallExtensionRequest
from app_cache import clear_cache, get_cached, set_cache

router = APIRouter()


@router.get("/extensions")
@require_ai_loaded
async def list_extensions():
    """Returns the list of installed skills."""
    cached = get_cached("extensions_list", 3)
    if cached is not None:
        return cached
    app_state.extension_manager.load_all()
    data = app_state.extension_manager.get_all_skills()
    set_cache("extensions_list", data)
    return data


@router.get("/extensions/registry")
@require_ai_loaded
async def get_registry():
    """Fetches available extensions from the cloud."""
    cached = get_cached("extensions_registry", 60)
    if cached is not None:
        return cached
    from services.extensions.installer import extension_installer

    data = extension_installer.fetch_registry()
    set_cache("extensions_registry", data)
    return data


@router.post("/extensions/install")
@require_ai_loaded
async def install_extension(
    req: InstallExtensionRequest, background_tasks: BackgroundTasks
):
    """Installs a new extension in the background."""
    from services.extensions.installer import extension_installer

    async def _do_install():
        success = await asyncio.to_thread(
            extension_installer.install, req.download_url, req.id
        )
        if success:
            await app_state.broadcast_to_sockets(
                {
                    "type": "extensions_sync",
                    "data": app_state.extension_manager.get_all_skills(),
                }
            )
            clear_cache(["extensions_list", "extensions_registry"])

    background_tasks.add_task(_do_install)
    return {"status": "ok", "message": "Installation started"}


@router.post("/extensions/reload")
@require_ai_loaded
async def reload_extensions():
    """Reloads all extensions/skills."""
    app_state.extension_manager.load_all()
    clear_cache(["extensions_list"])
    return {"status": "ok", "data": app_state.extension_manager.get_all_skills()}
