import asyncio

from fastapi import APIRouter, BackgroundTasks

import app_state
from api.deps import require_ai_loaded
from api.schemas import ExtensionToggle, InstallExtensionRequest, ExtensionActionRequest
from app_cache import clear_cache, get_cached, set_cache

router = APIRouter()


@router.get("/extensions")
@require_ai_loaded
async def list_extensions():
    """Retorna a lista de extensoes instaladas e ativas."""
    cached = get_cached("extensions_list", 3)
    if cached is not None:
        return cached
    app_state.extension_manager.load_all()
    data = app_state.extension_manager.get_active_manifests()
    set_cache("extensions_list", data)
    return data


@router.get("/extensions/registry")
@require_ai_loaded
async def get_registry():
    """Busca extensoes disponiveis na nuvem."""
    cached = get_cached("extensions_registry", 60)
    if cached is not None:
        return cached
    from services.extensions.installer import extension_installer
    data = extension_installer.fetch_registry()
    set_cache("extensions_registry", data)
    return data


@router.post("/extensions/install")
@require_ai_loaded
async def install_extension(req: InstallExtensionRequest, background_tasks: BackgroundTasks):
    """Instala uma nova extensao em segundo plano."""
    from services.extensions.installer import extension_installer

    async def _do_install() -> None:
        success = await asyncio.to_thread(extension_installer.install, req.download_url, req.id)
        if success:
            await app_state.broadcast_to_sockets({
                "type": "extensions_sync",
                "data": app_state.extension_manager.get_active_manifests()
            })
            clear_cache(["extensions_list", "extensions_registry"])

    background_tasks.add_task(_do_install)
    return {"status": "ok", "message": "Instalacao iniciada"}


@router.post("/extensions/toggle")
@require_ai_loaded
async def toggle_extension(req: ExtensionToggle):
    """Ativa ou desativa uma extensao usando o novo sistema de hooks."""
    if req.enabled:
        success = await asyncio.to_thread(app_state.extension_manager.enable_extension, req.id)
    else:
        success = await asyncio.to_thread(app_state.extension_manager.disable_extension, req.id)

    if success:
        await app_state.broadcast_to_sockets({
            "type": "extensions_sync",
            "data": app_state.extension_manager.get_active_manifests()
        })
        clear_cache(["extensions_list"])
        return {"status": "ok"}
    return {"status": "error", "message": "Falha ao alterar estado da extensao"}


@router.post("/extensions/uninstall")
@require_ai_loaded
async def uninstall_extension(req: ExtensionToggle):
    """Desinstala uma extensao completamente."""
    success = await asyncio.to_thread(app_state.extension_manager.uninstall_extension, req.id)
    if success:
        await app_state.broadcast_to_sockets({
            "type": "extensions_sync",
            "data": app_state.extension_manager.get_active_manifests()
        })
        clear_cache(["extensions_list", "extensions_registry"])
        return {"status": "ok"}
    return {"status": "error", "message": "Falha na desinstalacao"}


@router.post("/extensions/{ext_id}/action")
@require_ai_loaded
async def extension_action(ext_id: str, req: ExtensionActionRequest):
    """Executa uma acao enviada pela interface da extensao."""
    return await app_state.extension_manager.dispatch_action(ext_id, req.action, req.payload)
