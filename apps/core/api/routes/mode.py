import asyncio

from fastapi import APIRouter

import app_state
from api.deps import require_ai_loaded
from api.schemas import ModeChange

router = APIRouter()


@router.post("/mode")
@require_ai_loaded
async def set_mode(mode_data: ModeChange):
    # Ignore requested mode, force local
    import threading
    threading.Thread(target=app_state.initialize_llm).start()
    await app_state.broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": "local"}})
    return {"status": "ok", "mode": "local"}
