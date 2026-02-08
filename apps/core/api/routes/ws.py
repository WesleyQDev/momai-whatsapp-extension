from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import app_state

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    app_state.active_websockets.append(websocket)
    try:
        if not app_state.ai_stack_loaded:
            app_state.initialize_ai_stack()

        if app_state.last_init_event["progress"] < 100:
            await websocket.send_json({
                "type": "init_progress",
                "data": app_state.last_init_event
            })

        await websocket.send_json({
            "type": "extensions_sync",
            "data": app_state.extension_manager.get_active_manifests()
        })

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in app_state.active_websockets:
            app_state.active_websockets.remove(websocket)
