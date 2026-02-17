import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import app_state
from api.deps import get_db, require_ai_loaded
from api.schemas import ChatMessage

router = APIRouter()


@router.post("/chat/stream")
@require_ai_loaded
async def handle_chat_stream(message: ChatMessage):
    return StreamingResponse(app_state.generate(message), media_type="text/event-stream")


@router.post("/chat/stop")
async def stop_chat_generation():
    try:
        import ai.orchestrator as orchestrator
        orchestrator.request_cancel_generation()
    except Exception:
        pass

    try:
        import services.voice.tts as tts
        tts.stop_all()
    except Exception:
        pass

    if app_state.main_loop:
        await app_state.broadcast_to_sockets({"type": "tts_stop", "data": {}})

    return {"status": "ok"}


@router.post("/chat/stop-voice")
async def stop_chat_voice():
    try:
        import services.voice.tts as tts
        tts.stop_all()
    except Exception:
        pass

    if app_state.main_loop:
        await app_state.broadcast_to_sockets({"type": "tts_stop", "data": {}})

    return {"status": "ok"}


@router.post("/chat/speak")
async def speak_text(data: dict):
    text = data.get("text")
    if not text:
        return {"status": "error", "message": "No text provided"}
    
    try:
        import services.voice.tts as tts
        tts.speak_sentence(text)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/chat/history")
async def get_chat_history(thread_id: str = "default", db: Session = Depends(get_db)):
    from database.models import Message

    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
        .limit(100)
        .all()
    )

    result = []
    for msg in messages:
        msg_dict = {"role": msg.role, "content": msg.content}
        if msg.activities:
            try:
                msg_dict["activities"] = json.loads(msg.activities)
            except Exception:
                pass
        if msg.graph_data:
            try:
                msg_dict["graphData"] = json.loads(msg.graph_data)
            except Exception:
                pass
        result.append(msg_dict)

    return result


@router.delete("/chat/history")
async def delete_chat_history(thread_id: str = "default"):
    from ai.orchestrator import clear_history_db

    try:
        import ai.orchestrator as orchestrator
        orchestrator.request_cancel_generation()
    except Exception:
        pass

    try:
        import services.voice.tts as tts
        tts.stop_all()
    except Exception:
        pass

    if app_state.main_loop:
        await app_state.broadcast_to_sockets({"type": "tts_stop", "data": {}})

    await clear_history_db(thread_id)
    return {"status": "ok"}


@router.delete("/chat/message/{message_id}")
async def delete_single_message(message_id: int, db: Session = Depends(get_db)):
    from database.models import Message

    db.query(Message).filter(Message.id == message_id).delete()
    db.commit()
    return {"status": "ok"}
