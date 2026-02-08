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

    await clear_history_db(thread_id)
    return {"status": "ok"}
