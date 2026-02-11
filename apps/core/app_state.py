import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

active_websockets: list[WebSocket] = []
main_loop: asyncio.AbstractEventLoop | None = None
reminder_manager = None
ww = None
system_ready = asyncio.Event()

is_gaming_mode = False
ai_stack_loaded = False
ai_busy = False

last_init_event: dict[str, Any] = {
    "stage": "pending",
    "message": "Aguardando inicializacao...",
    "progress": 0
}

orchestrator = None
generate = None
initialize_llm = None
WakeWordDetector = None
ReminderManager = None
tts = None
extension_manager = None

active_graph = {
    "view": None,
    "bypass_wake_word": False
}

pending_graph_data: dict[str, dict[str, Any]] = {}


def initialize_ai_stack() -> None:
    """Lazy load heavy AI modules."""
    global orchestrator, generate, initialize_llm, WakeWordDetector, ReminderManager, tts, extension_manager, ai_stack_loaded

    if ai_stack_loaded:
        return

    logger.info("[Main] Loading AI stack...")
    import ai.orchestrator as orch
    orchestrator = orch
    from ai.orchestrator import generate as gen_func, initialize_llm as init_llm
    generate = gen_func
    initialize_llm = init_llm
    from services.voice.detector import WakeWordDetector as WWD
    WakeWordDetector = WWD
    from services.reminders.manager import ReminderManager as RM
    ReminderManager = RM
    import services.voice.tts as t
    tts = t
    from services.extensions.manager import extension_manager as em
    extension_manager = em

    ai_stack_loaded = True
    logger.info("[Main] AI stack loaded.")


def set_gaming_mode(enabled: bool) -> None:
    """Set gaming mode flag."""
    global is_gaming_mode
    is_gaming_mode = enabled
    logger.info("[Main] Gaming mode: %s", enabled)


def set_ai_busy(enabled: bool) -> None:
    """Marks when the AI pipeline is actively streaming a response."""
    global ai_busy
    ai_busy = enabled


def is_ai_busy() -> bool:
    """Returns True when AI is generating or speaking a response."""
    return ai_busy


def set_pending_graph_data(thread_id: str, data: dict) -> None:
    """Stores graph data to be saved with the next message."""
    pending_graph_data[thread_id] = data


def get_pending_graph_data(thread_id: str) -> dict | None:
    """Retrieves and clears pending graph data for a thread."""
    return pending_graph_data.pop(thread_id, None)


def get_graph_state() -> dict[str, Any]:
    """Returns current active UI graph state."""
    return active_graph


def set_graph_state(view: str | None, bypass_wake_word: bool = False) -> None:
    """Updates the active UI graph state."""
    global active_graph
    active_graph = {"view": view, "bypass_wake_word": bypass_wake_word}
    logger.info("[Main] Graph State changed: %s", active_graph)


async def broadcast_to_sockets(message: dict) -> None:
    """Broadcasts a JSON message to all connected WebSockets."""
    for ws in active_websockets:
        try:
            await ws.send_json(message)
        except Exception as exc:
            logger.warning("[WebSocket] Broadcast error: %s", exc)


async def send_init_event(stage: str, message: str, progress: int = 0) -> None:
    """Envia eventos de progresso de inicializacao para o frontend."""
    global last_init_event

    last_init_event = {
        "stage": stage,
        "message": message,
        "progress": progress
    }

    await broadcast_to_sockets({
        "type": "init_progress",
        "data": last_init_event
    })
    logger.info("[Init %s%%] %s: %s", progress, stage, message)


async def process_voice_command(text: str) -> None:
    """Processes a recognized voice command through the AI engine."""
    if not text:
        return
    logger.info("[Voice] Processing: %s", text)

    for ws in active_websockets:
        try:
            await ws.send_json({"type": "user", "content": text})
        except Exception as exc:
            logger.warning("[Voice] Socket send error: %s", exc)

    from api.schemas import ChatMessage

    msg = ChatMessage(content=text, thread_id="default")
    try:
        async for chunk in generate(msg):
            if chunk.startswith("data: "):
                json_str = chunk.replace("data: ", "").strip()
                if not json_str:
                    continue
                try:
                    data = json.loads(json_str)
                    for ws in active_websockets:
                        try:
                            await ws.send_json({"type": "assistant", "data": data})
                        except Exception as exc:
                            logger.warning("[Voice] Chunk send error: %s", exc)
                except json.JSONDecodeError:
                    pass
    except Exception as exc:
        logger.exception("Error processing voice: %s", exc)


async def broadcast_resource_usage() -> None:
    """Background task to broadcast system resource usage."""
    while True:
        if active_websockets:
            try:
                import tools.system_actions as sys_tools
                stats = sys_tools.get_momai_resources()
                await broadcast_to_sockets({
                    "type": "resource_usage",
                    "data": stats
                })
            except Exception as exc:
                logger.debug("Error getting resource usage: %s", exc)
        await asyncio.sleep(5)


def notify_economy_change(status: str) -> None:
    """Callback para o ResourceManager notificar a UI via WebSocket."""
    if main_loop:
        main_loop.call_soon_threadsafe(
            lambda: asyncio.create_task(broadcast_to_sockets({
                "type": "fortscript_event",
                "status": status,
                "timestamp": datetime.now().isoformat()
            }))
        )
