import sys
import io

# Força o console do Windows a usar UTF-8 para evitar erros de 'charmap'
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from ai.orchestrator import generate
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from dotenv import load_dotenv
from pydantic import BaseModel
import tomllib
from pathlib import Path
from sqlalchemy import text
from ai.orchestrator import initialize_llm
import ai.orchestrator as orchestrator
import tools.system_actions as tools
from services.voice.detector import WakeWordDetector
import threading
import os
import psutil
import json
import asyncio
import logging
from datetime import datetime
from database.models import init_db, SessionLocal, Reminder, Settings
from services.reminders.manager import ReminderManager
import services.voice.tts as tts
import json

# Silencia logs de acesso do uvicorn especificamente para o endpoint /status
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/status" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# Global Managers
active_websockets: list[WebSocket] = []
main_loop: asyncio.AbstractEventLoop = None
reminder_manager = None
ww = None

active_graph = {
    "view": None, 
    "bypass_wake_word": False
}

def get_graph_state():
    """Returns current active UI graph state."""
    return active_graph

def set_graph_state(view: str | None, bypass_wake_word: bool = False):
    """Updates the active UI graph state."""
    global active_graph
    active_graph = {"view": view, "bypass_wake_word": bypass_wake_word}
    print(f"[Main] Graph State changed: {active_graph}")

async def broadcast_to_sockets(message: dict):
    """Broadcasts a JSON message to all connected WebSockets."""
    for ws in active_websockets:
        try:
            await ws.send_json(message)
        except Exception as e:
            print(f"[WebSocket] Broadcast error: {e}")

async def process_voice_command(text: str):
    """Processes a recognized voice command through the AI engine."""
    if not text: return
    print(f"[Voice] Processing: {text}")
    
    for ws in active_websockets:
        try:
            await ws.send_json({"type": "user", "content": text})
        except Exception as e:
            print(f"[Voice] Socket send error: {e}")

    # Use "default" thread to share history with UI
    msg = ChatMessage(content=text, thread_id="default")
    try:
        async for chunk in generate(msg):
            if chunk.startswith("data: "):
                json_str = chunk.replace("data: ", "").strip()
                if not json_str: continue
                try:
                    data = json.loads(json_str)
                    for ws in active_websockets:
                        try:
                            await ws.send_json({"type": "assistant", "data": data})
                        except Exception as e:
                            print(f"[Voice] Chunk send error: {e}")
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        print(f"Error processing voice: {e}")

async def broadcast_resource_usage():
    """Background task to broadcast system resource usage."""
    while True:
        if active_websockets:
            stats = tools.get_momai_resources()
            await broadcast_to_sockets({
                "type": "resource_usage",
                "data": stats
            })
        await asyncio.sleep(2)



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Database and Migrations
    init_db()
    
    # Simple migration: ensure new columns exist
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE settings ADD COLUMN local_backend TEXT DEFAULT 'auto'"))
        db.commit()
    except:
        pass # Column likely already exists
    
    # Ensure default settings exist and apply them
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    # Apply Settings
    tts.tts.set_voice(settings.tts_voice)
    tts.tts.set_enabled(settings.tts_enabled)
    orchestrator.SYSTEM_PROMPT = settings.assistant_persona
    
    global main_loop, reminder_manager, ww
    main_loop = asyncio.get_running_loop()
    
    # Start resource usage broadcaster
    asyncio.create_task(broadcast_resource_usage())

    from ai.orchestrator import AsyncSqliteSaver, CHECKPOINT_PATH
    
    print(f"[Main] Connecting to checkpointer: {CHECKPOINT_PATH}")
    async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_PATH) as saver:
        orchestrator.checkpointer = saver

        # Initialize LLM with default provider
        print(f"[Main] Initializing with default provider: {settings.ai_provider}")
        orchestrator.initialize_llm(settings.ai_provider)
        
        reminder_manager = ReminderManager(
            broadcast_callback=broadcast_to_sockets,
            tts_callback=tts.speak_sentence
        )
        reminder_manager.start()

        def on_wake_word(text):
            if main_loop and main_loop.is_running():
                asyncio.run_coroutine_threadsafe(process_voice_command(text), main_loop)

        def should_bypass_wake_word():
            state = get_graph_state()
            return state["view"] is not None and state["bypass_wake_word"]

        print("[FastAPI] Starting Wake Word Detector...")
        ww = WakeWordDetector(keyword="Sistema", callback=on_wake_word, bypass_condition=should_bypass_wake_word)
        
        if settings.wake_word_enabled:
            ww.start()
        else:
            print("[WakeWord] Disabled in settings.")
            
        db.close()

        def monitor_parent():
            """Exits if parent process (Electron) dies."""
            parent = psutil.Process(os.getpid()).parent()
            if parent:
                parent.wait()
                os._exit(0)

        if sys.platform == "win32":
            threading.Thread(target=monitor_parent, daemon=True).start()

        yield
        
    # Shutdown
    print("[FastAPI] Shutting down...")
    if reminder_manager: reminder_manager.stop()
    if ww: ww.stop()
    try:
        from ai.providers.local_llama import stop_server
        stop_server()
    except: pass
    try:
        tts.stop_all()
    except: pass


# --- APP SETUP ---
app = FastAPI(lifespan=lifespan)
load_dotenv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class ChatMessage(BaseModel):
    content: str
    thread_id: str = "default"

class ModeChange(BaseModel):
    mode: str

class ReminderCreate(BaseModel):
    title: str
    content: str | None = None
    scheduled_time: datetime
    repeat_interval: str | None = None
    repeat_value: int | None = None

class SettingsUpdate(BaseModel):
    user_name: str | None = None
    assistant_persona: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    local_backend: str | None = None
    api_keys: dict | None = None
    tts_voice: str | None = None
    tts_enabled: bool | None = None
    wake_word_enabled: bool | None = None
    wake_word_sensitivity: int | None = None

# --- ROUTES ---
@app.post("/chat/stream")
async def handle_chat_stream(message: ChatMessage):
    return StreamingResponse(generate(message), media_type="text/event-stream")

@app.get("/chat/history")
async def get_chat_history(thread_id: str = "default"):
    from ai.orchestrator import get_graph_history
    history = await get_graph_history(thread_id)
    
    # Se o grafo estiver vazio (ex: novo banco de checkpoints), tenta o fallback do DB relacional
    if not history:
        from ai.orchestrator import load_history_from_db
        history = load_history_from_db(thread_id, limit=50)

    return [
        {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": m.content}
        for m in history if not isinstance(m, (SystemMessage, ToolMessage)) # Filtra para a UI
    ]

@app.delete("/chat/history")
async def delete_chat_history(thread_id: str = "default"):
    from ai.orchestrator import clear_history_db
    await clear_history_db(thread_id)
    return {"status": "ok"}

@app.get("/status")
def get_status():
    db = SessionLocal()
    settings = db.query(Settings).first()
    
    api_keys = {}
    try:
        api_keys = json.loads(settings.api_keys) if settings.api_keys else {}
    except:
        pass
        
    engine_ok = downloader.check_engine_installed()
    install_info = downloader.get_installed_info()
    latest_v = downloader.get_latest_llama_version()
    db.close()
    
    return {
        "status": "ok", 
        "version": tools.version, 
        "mode": orchestrator.llm_mode,
        "setup": {
            "local_installed": engine_ok,
            "installed_version": install_info.get("version") if install_info else None,
            "latest_version": latest_v,
            "groq_ready": bool(api_keys.get("groq")),
            "gemini_ready": bool(api_keys.get("gemini"))
        }
    }

@app.post("/mode")
async def set_mode(mode_data: ModeChange):
    initialize_llm(mode_data.mode)
    await broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": mode_data.mode}})
    return {"status": "ok", "mode": mode_data.mode}

@app.get("/reminders")
def list_reminders_route():
    reminders = reminder_manager.list_reminders()
    return [
        {
            "id": r.id,
            "title": r.title,
            "content": r.content,
            "scheduled_time": r.scheduled_time.isoformat(),
            "repeat_interval": r.repeat_interval,
            "repeat_value": r.repeat_value,
            "is_active": r.is_active
        } for r in reminders
    ]

@app.get("/reminders/active")
def list_active_reminders():
    db = SessionLocal()
    now = datetime.now()
    reminders = db.query(Reminder).filter(Reminder.is_active == True).order_by(Reminder.scheduled_time.asc()).limit(5).all()
    db.close()
    return [
        {
            "id": r.id,
            "title": r.title,
            "scheduled_time": r.scheduled_time.isoformat(),
        } for r in reminders
    ]

@app.post("/reminders")
def create_reminder_route(data: ReminderCreate):
    return reminder_manager.add_reminder(
        data.title, data.content, data.scheduled_time, data.repeat_interval, data.repeat_value
    )

@app.delete("/reminders/{reminder_id}")
def delete_reminder_route(reminder_id: int):
    reminder_manager.delete_reminder(reminder_id)
    return {"status": "deleted"}

@app.get("/settings")
def get_settings():
    db = SessionLocal()
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
        db.commit()
    
    # Parse API keys safely
    api_keys = {}
    try:
        api_keys = json.loads(settings.api_keys) if settings.api_keys else {}
    except:
        pass

    result = {
        "user_name": settings.user_name,
        "assistant_persona": settings.assistant_persona,
        "ai_provider": settings.ai_provider,
        "ai_model": settings.ai_model,
        "local_backend": settings.local_backend,
        "api_keys": api_keys,
        "tts_voice": settings.tts_voice,
        "tts_enabled": settings.tts_enabled,
        "wake_word_enabled": settings.wake_word_enabled,
        "wake_word_sensitivity": settings.wake_word_sensitivity
    }
    db.close()
    return result

@app.patch("/settings")
async def update_settings(data: SettingsUpdate):
    db = SessionLocal()
    settings = db.query(Settings).first()
    
    changes = []
    
    if data.user_name is not None: 
        settings.user_name = data.user_name
        changes.append("user_name")
        
    if data.assistant_persona is not None: 
        settings.assistant_persona = data.assistant_persona
        changes.append("persona")
        
    if data.ai_provider is not None: 
        settings.ai_provider = data.ai_provider
        changes.append("provider")

    if data.ai_model is not None: settings.ai_model = data.ai_model
    
    if data.local_backend is not None: settings.local_backend = data.local_backend
    
    if data.api_keys is not None:
        settings.api_keys = json.dumps(data.api_keys)
        
    if data.tts_voice is not None:
        settings.tts_voice = data.tts_voice
        tts.tts.set_voice(data.tts_voice) # Apply immediately

    if data.tts_enabled is not None:
        settings.tts_enabled = data.tts_enabled
        tts.tts.set_enabled(settings.tts_enabled)
        
    if data.wake_word_enabled is not None:
        settings.wake_word_enabled = data.wake_word_enabled
        if ww:
            if settings.wake_word_enabled:
                ww.start()
            else:
                ww.stop()
        
    if data.wake_word_sensitivity is not None:
        settings.wake_word_sensitivity = data.wake_word_sensitivity

    db.commit()
    
    # Reload graph and LLM if persona, user_name or provider changed
    if any(x in changes for x in ["persona", "user_name", "provider"]):
        # Pass the latest values from the DB or payload
        initialize_llm(settings.ai_provider)
        if "provider" in changes:
            await broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": settings.ai_provider}})

    db.close()
    return {"status": "updated", "changes": changes}

import utils.downloader as downloader

# ... (código existente)

@app.get("/setup/status")
def get_setup_status():
    """Verifica status detalhado da instalação local."""
    db = SessionLocal()
    settings = db.query(Settings).first()
    current_local_backend = settings.local_backend if settings else "auto"
    db.close()

    engine_ok = downloader.check_engine_installed()
    models_path = Path(__file__).parent / "models"
    models_ok = any(models_path.glob("*.gguf"))
    
    # Informações detalhadas
    install_info = downloader.get_installed_info()
    hw_info = downloader.get_hardware_info()
    installed_backends = downloader.get_all_installed_backends()
    
    latest_v = downloader.get_latest_llama_version()
    
    return {
        "engine_installed": engine_ok,
        "models_installed": models_ok,
        "detected_hardware": hw_info.get("gpu_name") or "Não Detectada",
        "cpu_name": hw_info.get("cpu_name"),
        "recommended_build": hw_info.get("backend"),
        "available_builds": downloader.get_available_builds(latest_v),
        "latest_version": latest_v,
        "installed_version": install_info.get("version") if install_info else None,
        "installed_build": install_info.get("build_type") if install_info else None,
        "installed_backends": installed_backends,
        "current_local_backend": current_local_backend
    }

class InstallRequest(BaseModel):
    backend: str | None = None

@app.post("/setup/install-engine")
async def install_engine(req: InstallRequest | None = None):
    """Inicia o download do motor Llama.cpp."""
    loop = asyncio.get_running_loop()
    forced = req.backend if req else None

    def sync_report_progress(percent):
        asyncio.run_coroutine_threadsafe(
            broadcast_to_sockets({
                "type": "setup_progress",
                "data": {"step": "download_engine", "percent": percent}
            }),
            loop
        )

    try:
        # Roda em thread separada para não bloquear o async loop
        success = await asyncio.to_thread(downloader.setup_local_engine, sync_report_progress, forced)
        
        if success:
             await broadcast_to_sockets({"type": "setup_complete", "data": {"step": "download_engine"}})
             return {"status": "ok"}
        else:
             return {"status": "error", "message": "Falha no download ou instalação"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.delete("/setup/uninstall-engine")
async def uninstall_engine(backend: str | None = None):
    """Remove o motor local."""
    # Para o servidor se estiver rodando
    try:
        from ai.providers.local_llama import stop_server
        stop_server()
    except:
        pass
        
    success = downloader.uninstall_engine(backend)
    if success:
        return {"status": "ok"}
    return {"status": "error", "message": "Falha ao remover arquivos"}

@app.websocket("/ws")
# ... (resto do código)
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets: active_websockets.remove(websocket)

# Sincroniza versão
try:
    with open(Path(__file__).parent / "pyproject.toml", "rb") as f:
        data = tomllib.load(f)
        tools.version = data.get("project", {}).get("version", "0.0.0")
except:
    tools.version = "0.0.0"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
        