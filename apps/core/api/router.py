from fastapi import APIRouter

api_router = APIRouter()


def include_routes():
    from api.routes import (
        chat,
        diagnostic,
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
        voice,
        ws,
    )

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
    api_router.include_router(voice.router)
    api_router.include_router(ws.router)
    api_router.include_router(diagnostic.router)


include_routes()
