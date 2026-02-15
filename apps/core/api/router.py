from fastapi import APIRouter

from api.routes import (
    chat,
    extensions,
    gaming,
    hardware,
    init_status,
    memory,
    mode,
    reminders,
    settings,
    setup,
    status,
    ws,
)

api_router = APIRouter()

api_router.include_router(init_status.router)
api_router.include_router(status.router)
api_router.include_router(chat.router)
api_router.include_router(mode.router)
api_router.include_router(reminders.router)
api_router.include_router(settings.router)
api_router.include_router(memory.router)
api_router.include_router(setup.router)
api_router.include_router(extensions.router)
api_router.include_router(gaming.router)
api_router.include_router(hardware.router)
api_router.include_router(ws.router)
