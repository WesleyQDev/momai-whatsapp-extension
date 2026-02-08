import asyncio

from fastapi import APIRouter

import app_state
from api.deps import require_ai_loaded
from api.schemas import ModeChange

router = APIRouter()


@router.post("/mode")
@require_ai_loaded
async def set_mode(mode_data: ModeChange):
    await asyncio.to_thread(app_state.initialize_llm, mode_data.mode)
    await app_state.broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": mode_data.mode}})
    return {"status": "ok", "mode": mode_data.mode}
