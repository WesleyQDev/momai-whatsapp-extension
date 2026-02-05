import sys
import io

# Força o console do Windows a usar UTF-8 para evitar erros de 'charmap'
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from pydantic import BaseModel
import tomllib
from pathlib import Path
from sqlalchemy import text
import threading
import os
import psutil
import json
import asyncio
import logging
import gc
from datetime import datetime
from database.models import init_db, SessionLocal, Reminder, Settings, Extension, GamingApp
from services.system.resource_manager import resource_manager

# Heavy imports (lazy loaded in lifespan)
# from ai.orchestrator import generate, initialize_llm
# import ai.orchestrator as orchestrator
# from services.reminders.manager import ReminderManager
# from services.voice.detector import WakeWordDetector

# Silencia logs de acesso do uvicorn especificamente para o endpoint /status
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/status" not in record.getMessage()
logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# Global version variable
app_version = "0.1.0-alpha"

# Configure Root Logger to ensure print statements and logs are visible
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
if not root_logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    root_logger.addHandler(handler)

# Global Managers - Lazy loaded
active_websockets: list[WebSocket] = []
main_loop: asyncio.AbstractEventLoop = None
reminder_manager = None
ww = None

# Gaming mode flag
is_gaming_mode = False
ai_stack_loaded = False

# Init progress tracking (armazena último evento para novos WebSockets)
last_init_event = {
    "stage": "pending",
    "message": "Aguardando inicialização...",
    "progress": 0
}

# Lazy-loaded modules
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

# --- LAZY LOADING FUNCTIONS ---
def initialize_ai_stack():
    """Lazy load heavy AI modules."""
    global orchestrator, generate, initialize_llm, WakeWordDetector, ReminderManager, tts, extension_manager, ai_stack_loaded
    
    if ai_stack_loaded:
        return
    
    print("[Main] Loading AI stack...")
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
    print("[Main] AI stack loaded.")

def set_gaming_mode(enabled: bool):
    """Set gaming mode flag."""
    global is_gaming_mode
    is_gaming_mode = enabled
    print(f"[Main] Gaming mode: {enabled}")

# Track pending graph data per thread (for persistence)
pending_graph_data = {}  # thread_id -> graph_data dict

def set_pending_graph_data(thread_id: str, data: dict):
    """Stores graph data to be saved with the next message."""
    global pending_graph_data
    pending_graph_data[thread_id] = data

def get_pending_graph_data(thread_id: str) -> dict | None:
    """Retrieves and clears pending graph data for a thread."""
    global pending_graph_data
    return pending_graph_data.pop(thread_id, None)

# --- DEPENDENCIES ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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


async def send_init_event(stage: str, message: str, progress: int = 0):
    """Envia eventos de progresso de inicialização para o frontend."""
    global last_init_event
    
    # Armazena último evento para novos WebSockets
    last_init_event = {
        "stage": stage,
        "message": message,
        "progress": progress,
        "version": app_version
    }
    
    # Broadcast para WebSockets conectados
    await broadcast_to_sockets({
        "type": "init_progress",
        "data": last_init_event
    })
    print(f"[Init {progress}%] {stage}: {message}")

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
            try:
                import tools.system_actions as sys_tools
                stats = sys_tools.get_momai_resources()
                await broadcast_to_sockets({
                    "type": "resource_usage",
                    "data": stats
                })
            except Exception as e:
                logger.debug(f"Error getting resource usage: {e}")
        await asyncio.sleep(2)
        

def notify_economy_change(status: str):
    """Callback para o ResourceManager notificar a UI via WebSocket."""
    if main_loop:
        main_loop.call_soon_threadsafe(
            lambda: asyncio.create_task(broadcast_to_sockets({
                "type": "fortscript_event",
                "status": status,
                "timestamp": datetime.now().isoformat()
            }))
        )



async def init_system_task():
    """Tarefa de segundo plano para inicializar o sistema sem travar o servidor."""
    global reminder_manager, ww
    
    try:
        # Evento 1: API iniciada
        await send_init_event("api", "Protocolos de sistema iniciados", 10)
        
        # Startup: Database and Migrations
        init_db()
        await send_init_event("api", "Banco de dados conectado", 15)
        
        # Initialize AI stack (lazy loading)
        initialize_ai_stack()
        await send_init_event("brain", "Módulos de IA carregados", 35)
        
        # Microkernel Startup: Load all agents (Builtin + Extensions)
        extension_manager.load_all()
        ext_count = len(extension_manager.get_active_manifests())
        await send_init_event("extensions", f"{ext_count} extensões carregadas", 50)
        
        # Knowledge Base sync
        try:
            from utils.indexer import index_all_system_tools, index_initial_intents
            await send_init_event("brain", "Indexando ferramentas...", 55)
            await index_all_system_tools()
            await send_init_event("brain", "Indexando intenções...", 60)
            await index_initial_intents()
        except Exception as e:
            print(f"[Main] Indexing error: {e}")
        
        db = SessionLocal()
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings()
            db.add(settings)
            db.commit()
            db.refresh(settings)

        # Apply Settings
        await send_init_event("brain", "Aplicando configurações...", 70)
        tts.tts.set_voice(settings.tts_voice)
        tts.tts.set_enabled(settings.tts_enabled)
        orchestrator.SYSTEM_PROMPT = settings.assistant_persona
        
        # Resource monitor
        resource_manager.on_notify_callback = notify_economy_change
        resource_manager.start()
        await send_init_event("extensions", "Monitor de recursos ativado", 75)

        from ai.orchestrator import AsyncSqliteSaver, CHECKPOINT_PATH
        async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_PATH) as saver:
            orchestrator.checkpointer = saver
            await send_init_event("brain", "Iniciando cérebro principal...", 80)

            def on_brain_init(status):
                if main_loop:
                    asyncio.run_coroutine_threadsafe(send_init_event("brain", status, 82), main_loop)

            orchestrator.initialize_llm(settings.ai_provider, on_init_progress=on_brain_init)
            await asyncio.to_thread(orchestrator.llm_ready_event.wait, timeout=60.0)
            await send_init_event("brain", "Cérebro inicializado", 85)
            
            reminder_manager = ReminderManager(
                broadcast_callback=broadcast_to_sockets,
                tts_callback=tts.speak_sentence
            )
            reminder_manager.start()

            def on_wake_word(text):
                if main_loop: asyncio.run_coroutine_threadsafe(process_voice_command(text), main_loop)

            def should_bypass_wake_word():
                state = get_graph_state()
                return state["view"] is not None and state["bypass_wake_word"]

            await send_init_event("brain", "Iniciando detector de voz...", 92)
            ww = WakeWordDetector(keyword="Sistema", callback=on_wake_word, bypass_condition=should_bypass_wake_word)
            if settings.wake_word_enabled: ww.start()
            
            if settings.tts_enabled:
                await send_init_event("voice", "Sincronizando voz local...", 95)
                await asyncio.to_thread(tts.tts.wait_until_ready, timeout=15.0)

            await send_init_event("ready", "Sistema operacional pronto.", 100)
        db.close()
    except Exception as e:
        print(f"[InitTask] Erro fatal: {e}")
        await send_init_event("error", f"Erro: {str(e)}", 0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    # Start background init
    asyncio.create_task(init_system_task())
    
    # Start resource usage broadcaster
    asyncio.create_task(broadcast_resource_usage())

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
    if ww: ww.stop()
    if reminder_manager: reminder_manager.stop()
    resource_manager.stop()
    
    # Shutdown
    print("[FastAPI] Shutting down...")
    
    # Stop embeddings server (port 8081)
    try:
        from ai.embeddings import embeddings
        embeddings.stop()
        print("[FastAPI] Embeddings server stopped.")
    except Exception as e:
        print(f"[FastAPI] Error stopping embeddings: {e}")
    
    # Stop reminder manager
    if reminder_manager:
        try:
            reminder_manager.stop()
            print("[FastAPI] Reminder manager stopped.")
        except Exception as e:
            print(f"[FastAPI] Error stopping reminder manager: {e}")
    
    # Stop wake word detector
    if ww:
        try:
            ww.stop()
            print("[FastAPI] Wake word detector stopped.")
        except Exception as e:
            print(f"[FastAPI] Error stopping wake word detector: {e}")
    
    # Stop main llama server (port 8080)
    try:
        from ai.providers.local_llama import stop_server
        stop_server()
        print("[FastAPI] Main LLM server stopped.")
    except Exception as e:
        print(f"[FastAPI] Error stopping LLM server: {e}")
    
    # Stop TTS workers
    try:
        tts.stop_all()
        print("[FastAPI] TTS workers stopped.")
    except Exception as e:
        print(f"[FastAPI] Error stopping TTS: {e}")
    
    # Brief pause to allow processes to terminate gracefully
    import time
    time.sleep(0.5)
    
    print("[FastAPI] Shutdown complete.")


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

# --- DECORATORS ---
def require_ai_loaded(func):
    """Decorator to ensure AI stack is loaded before route execution."""
    import functools
    
    if asyncio.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            if not ai_stack_loaded:
                initialize_ai_stack()
            return await func(*args, **kwargs)
        return async_wrapper
    else:
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            if not ai_stack_loaded:
                initialize_ai_stack()
            return func(*args, **kwargs)
        return sync_wrapper

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

class ReminderUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    scheduled_time: datetime | None = None
    repeat_interval: str | None = None
    repeat_value: int | None = None
    is_active: bool | None = None

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

class ExtensionToggle(BaseModel):
    id: str
    enabled: bool

class GamingAppCreate(BaseModel):
    name: str
    executable: str

# --- ROUTES ---

@app.get("/init-status")
async def get_init_status():
    """Retorna o status atual de inicialização (fallback se WebSocket não conectar)."""
    return {
        "stage": last_init_event["stage"],
        "message": last_init_event["message"],
        "progress": last_init_event["progress"],
        "version": app_version,
        "ai_stack_loaded": ai_stack_loaded,
        "is_ready": last_init_event["progress"] >= 100
    }

@app.post("/chat/stream")
@require_ai_loaded
async def handle_chat_stream(message: ChatMessage):
    return StreamingResponse(generate(message), media_type="text/event-stream")

@app.get("/chat/history")
async def get_chat_history(thread_id: str = "default", db: Session = Depends(get_db)):
    from database.models import Message
    import json
    
    # Always use the relational DB for UI history (supports activities + graph_data)
    messages = db.query(Message).filter(Message.thread_id == thread_id).order_by(Message.created_at.asc()).limit(100).all()
    
    result = []
    for m in messages:
        msg_dict = {
            "role": m.role,
            "content": m.content
        }
        # Parse activities if present
        if m.activities:
            try:
                msg_dict["activities"] = json.loads(m.activities)
            except:
                pass
        # Parse graph_data if present
        if m.graph_data:
            try:
                msg_dict["graphData"] = json.loads(m.graph_data)
            except:
                pass
        result.append(msg_dict)
    
    return result

@app.delete("/chat/history")
async def delete_chat_history(thread_id: str = "default"):
    from ai.orchestrator import clear_history_db
    await clear_history_db(thread_id)
    return {"status": "ok"}

@app.get("/status")
async def get_status(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    
    api_keys = {}
    try:
        api_keys = json.loads(settings.api_keys) if settings.api_keys else {}
    except Exception:
        pass
        
    engine_ok = downloader.check_engine_installed()
    install_info = downloader.get_installed_info()
    latest_v = downloader.get_latest_llama_version()
    
    return {
        "status": "ok", 
        "version": app_version, 
        "mode": orchestrator.llm_mode,
        "brain_ready": orchestrator.llm is not None and orchestrator.momai_graph is not None,
        "is_loading": orchestrator.is_loading,
        "setup": {
            "local_installed": engine_ok,
            "installed_version": install_info.get("version") if install_info else None,
            "latest_version": latest_v,
            "groq_ready": bool(api_keys.get("groq")),
            "gemini_ready": bool(api_keys.get("gemini"))
        }
    }

@app.post("/mode")
@require_ai_loaded
async def set_mode(mode_data: ModeChange):
    # initialize_llm is likely blocking, run in thread
    await asyncio.to_thread(initialize_llm, mode_data.mode)
    await broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": mode_data.mode}})
    return {"status": "ok", "mode": mode_data.mode}

@app.get("/reminders")
@require_ai_loaded
async def list_reminders_route():
    reminders = await asyncio.to_thread(reminder_manager.list_reminders)
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
async def list_active_reminders(db: Session = Depends(get_db)):
    reminders = db.query(Reminder).filter(Reminder.is_active == True).order_by(Reminder.scheduled_time.asc()).limit(5).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "scheduled_time": r.scheduled_time.isoformat(),
        } for r in reminders
    ]

@app.post("/reminders")
@require_ai_loaded
async def create_reminder_route(data: ReminderCreate):
    return await asyncio.to_thread(reminder_manager.add_reminder,
        data.title, data.content, data.scheduled_time, data.repeat_interval, data.repeat_value
    )

@app.delete("/reminders/{reminder_id}")
@require_ai_loaded
async def delete_reminder_route(reminder_id: int):
    await asyncio.to_thread(reminder_manager.delete_reminder, reminder_id)
    return {"status": "deleted"}

@app.patch("/reminders/{reminder_id}")
@require_ai_loaded
async def update_reminder_route(reminder_id: int, data: ReminderUpdate):
    updated = await asyncio.to_thread(reminder_manager.update_reminder, 
        reminder_id, **data.model_dump(exclude_unset=True)
    )
    if not updated:
        return {"status": "error", "message": "Reminder not found"}
    return updated

@app.get("/settings")
async def get_settings(db: Session = Depends(get_db)):
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
    return result

def _sync_update_settings(data: SettingsUpdate):
    """Helper to perform blocking DB updates."""
    db = SessionLocal()
    try:
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
            # TTS update happens outside DB transaction usually, but here is fine
            
        if data.tts_enabled is not None:
            settings.tts_enabled = data.tts_enabled
            
        if data.wake_word_enabled is not None:
            settings.wake_word_enabled = data.wake_word_enabled
            
        if data.wake_word_sensitivity is not None:
            settings.wake_word_sensitivity = data.wake_word_sensitivity

        db.commit()
        db.refresh(settings) # Ensure we have latest data
        return changes, settings.ai_provider, settings.tts_voice, settings.tts_enabled, settings.wake_word_enabled
    finally:
        db.close()

@app.patch("/settings")
async def update_settings(data: SettingsUpdate):
    # Run blocking DB update in thread
    changes, provider, tts_voice, tts_enabled, ww_enabled = await asyncio.to_thread(_sync_update_settings, data)
    
    # Apply side effects (IO/Hardware)
    if data.tts_voice is not None:
        tts.tts.set_voice(tts_voice)

    if data.tts_enabled is not None:
        tts.tts.set_enabled(tts_enabled)
        
    if data.wake_word_enabled is not None:
        if ww:
            if ww_enabled:
                ww.start()
            else:
                ww.stop()

    # Reload graph and LLM if persona, user_name or provider changed
    if any(x in changes for x in ["persona", "user_name", "provider"]):
        # Heavy operation: initialize_llm
        await asyncio.to_thread(initialize_llm, provider)
        if "provider" in changes:
            await broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": provider}})

    return {"status": "updated", "changes": changes}

import utils.downloader as downloader

@app.get("/setup/status")
async def get_setup_status(db: Session = Depends(get_db)):
    """Verifica status detalhado da instalação local."""
    
    def _get_status():
        settings = db.query(Settings).first()
        current_local_backend = settings.local_backend if settings else "auto"

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
    
    return await asyncio.to_thread(_get_status)

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

@app.get("/extensions")
@require_ai_loaded
async def list_extensions():
    """Retorna a lista de extensões instaladas e ativas."""
    extension_manager.load_all()
    return extension_manager.get_active_manifests()


@app.get("/extensions/registry")
@require_ai_loaded
async def get_registry():
    """Busca extensões disponíveis na nuvem."""
    from services.extensions.installer import extension_installer
    return extension_installer.fetch_registry()

class InstallExtensionRequest(BaseModel):
    id: str
    download_url: str

@app.post("/extensions/install")
@require_ai_loaded
async def install_extension(req: InstallExtensionRequest):
    """Instala uma nova extensão."""
    from services.extensions.installer import extension_installer
    success = extension_installer.install(req.download_url, req.id)
    if success:
        extension_manager.load_all()
        return {"status": "ok"}
    return {"status": "error", "message": "Falha na instalação"}

@app.post("/extensions/toggle")
@require_ai_loaded
async def toggle_extension(req: ExtensionToggle):
    """Ativa ou desativa uma extensão."""
    def _toggle_db(id, enabled):
        db = SessionLocal()
        try:
            ext = db.query(Extension).filter(Extension.id == id).first()
            found = False
            if ext:
                ext.is_enabled = enabled
                db.commit()
                found = True
            return found
        finally:
            db.close()
            
    found = await asyncio.to_thread(_toggle_db, req.id, req.enabled)
    
    if found:
        extension_manager.load_all()
        # Broadcast the change
        await broadcast_to_sockets({
            "type": "extensions_sync",
            "data": extension_manager.get_active_manifests()
        })
        return {"status": "ok"}
    return {"status": "error", "message": "Extensão não encontrada"}


# --- GAMING MODE ROUTES ---
@app.get("/system/gaming-apps")
async def list_gaming_apps(db: Session = Depends(get_db)):
    apps = db.query(GamingApp).all()
    return [{"id": a.id, "name": a.name, "executable": a.executable, "is_active": a.is_active} for a in apps]

@app.post("/system/gaming-apps")
async def add_gaming_app(data: GamingAppCreate, db: Session = Depends(get_db)):
    try:
        new_app = GamingApp(name=data.name, executable=data.executable.lower())
        db.add(new_app)
        db.commit()
        # Reinicia o monitor para pegar a nova config
        resource_manager.start()
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}

@app.delete("/system/gaming-apps/{app_id}")
async def delete_gaming_app(app_id: int, db: Session = Depends(get_db)):
    def _delete_app():
        app = db.query(GamingApp).filter(GamingApp.id == app_id).first()
        if app:
            db.delete(app)
            db.commit()
            resource_manager.start()
            return True
        return False
    
    success = await asyncio.to_thread(_delete_app)
    if success:
        return {"status": "ok"}
    return {"status": "error", "message": "App não encontrado"}


@app.get("/extensions/hardware-stats")
async def get_hardware_stats():
    """Retorna dados reais de hardware para dashboards dinâmicos."""
    import psutil
    return {
        "cpu_usage": psutil.cpu_percent(),
        "ram_usage": psutil.virtual_memory().percent,
        "active_processes": len(psutil.pids()),
        "vram_usage": 0 # TODO: Implement GPU check
    }

@app.post("/memory/compact")
async def compact_memory():
    """Force memory compaction and cleanup."""
    print("[Main] Compacting memory...")
    try:
        # Force garbage collection
        gc.collect()
        
        # Clear embeddings cache
        if ai_stack_loaded:
            try:
                from ai.embeddings import embeddings
                embeddings.clear_all_cache()
            except:
                pass
        
        # Get memory stats
        import psutil
        process = psutil.Process()
        mem_info = process.memory_info()
        
        result = {
            "status": "ok",
            "memory_after_compact_mb": mem_info.rss / (1024 * 1024),
            "gaming_mode": is_gaming_mode
        }
        print(f"[Main] Memory compacted. New size: {result['memory_after_compact_mb']:.1f}MB")
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/memory/stats")
async def get_memory_stats():
    """Get detailed memory statistics."""
    try:
        import psutil
        process = psutil.Process()
        mem_info = process.memory_info()
        
        result = {
            "python_process_mb": mem_info.rss / (1024 * 1024),
            "gaming_mode": is_gaming_mode,
            "ai_stack_loaded": ai_stack_loaded
        }
        
        # Get embeddings stats if loaded
        if ai_stack_loaded:
            try:
                from ai.embeddings import embeddings
                emb_stats = embeddings.memory_stats()
                result["embeddings"] = emb_stats
            except:
                pass
        
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        # Ensure AI stack is loaded for extensions
        if not ai_stack_loaded:
            initialize_ai_stack()
        
        # Envia o último evento de progresso para o novo cliente (catch-up)
        if last_init_event["progress"] < 100:
            await websocket.send_json({
                "type": "init_progress",
                "data": last_init_event
            })
        
        # Envia as extensões logo ao conectar para o frontend sincronizar itens de barra lateral
        await websocket.send_json({
            "type": "extensions_sync",
            "data": extension_manager.get_active_manifests()
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets: active_websockets.remove(websocket)

# Sincroniza versão
try:
    with open(Path(__file__).parent / "pyproject.toml", "rb") as f:
        data = tomllib.load(f)
        app_version = data.get("project", {}).get("version", "0.0.0")
except Exception:
    app_version = "0.0.0"

if __name__ == "__main__":
    import uvicorn
    # Make reload conditional on environment variable for optimization
    should_reload = os.getenv("MOMAI_DEBUG", "false").lower() == "true"
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))
    
    print(f"[Main] Starting MomAI Core on {host}:{port} (Reload: {should_reload})")
    uvicorn.run("main:app", host=host, port=port, reload=should_reload)
