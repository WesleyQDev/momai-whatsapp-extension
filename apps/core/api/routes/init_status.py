from fastapi import APIRouter

import app_state

router = APIRouter()


@router.get("/init-status")
async def get_init_status():
    """Retorna o status atual de inicializacao (fallback se WebSocket nao conectar)."""
    return {
        "stage": app_state.last_init_event["stage"],
        "message": app_state.last_init_event["message"],
        "progress": app_state.last_init_event["progress"],
        "ai_stack_loaded": app_state.ai_stack_loaded,
        "is_ready": app_state.last_init_event["progress"] >= 100
    }
