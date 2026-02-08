import sys
import os
import threading
import logging
import atexit
import time
import gc
from pathlib import Path
from typing import List

# Add FortScript to sys.path to ensure we can import it
# Structure: apps/core/services/system/resource_manager.py -> apps/fortscript/src
FORT_PATH = Path(__file__).parent.parent.parent.parent / "fortscript" / "src"
if FORT_PATH.exists() and str(FORT_PATH) not in sys.path:
    sys.path.append(str(FORT_PATH))

try:
    from fortscript.main import FortScript, Callbacks
except ImportError:
    # Fallback case not in expected path (ex: installed via pip)
    try:
        from fortscript import FortScript, Callbacks
    except ImportError:
        FortScript = None
        Callbacks = None

from database.models import SessionLocal, GamingApp, Settings
from ai.providers.local_llama import stop_server, load_model
import ai.orchestrator as orchestrator
import services.voice.tts as tts

logger = logging.getLogger("momai.resource_manager")

class ResourceManager:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super(ResourceManager, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return
        
        self.fs = None
        self.thread = None
        self.lock = threading.Lock()
        self.is_gaming = False
        self.on_notify_callback = None # Callback to notify the UI (via websocket)
        self.initialized = True

    def start(self):
        """Initializes FortScript monitoring in a separate thread."""
        with self.lock:
            if self.thread and self.thread.is_alive():
                return

            if not FortScript:
                print("[ResourceManager] FortScript not found. Monitoring disabled.")
                logger.error("[ResourceManager] FortScript not found. Monitoring disabled.")
                return

            db = SessionLocal()
            try:
                # 1. Carrega apps configurados pelo usuário
                apps = db.query(GamingApp).filter(GamingApp.is_active == True).all()
                heavy_processes = [
                    {"name": app.name, "process": app.executable} 
                    for app in apps
                ]

                if not heavy_processes:
                    print("[ResourceManager] No active game apps configured. Monitoring on standby.")
                    logger.info("[ResourceManager] No active game apps configured. Monitoring on standby.")
                    return

                # 2. Configure Callbacks
                callbacks = Callbacks(
                    on_pause=self._enter_gaming_mode,
                    on_resume=self._exit_gaming_mode
                )

                # 3. Instancia FortScript
                self.fs = FortScript(
                    heavy_process=heavy_processes,
                    callbacks=callbacks,
                    projects=[], # Não gerenciamos scripts externos aqui
                    new_console=False
                )

                # 4. Inicia em Thread
                self.thread = threading.Thread(target=self.fs.run, daemon=True, name="FortScript-Monitor")
                self.thread.start()
                print(f"[ResourceManager] FortScript monitoring started for {len(heavy_processes)} applications.")
                logger.info(f"[ResourceManager] Monitoring started for {len(heavy_processes)} applications.")

            except Exception as e:
                logger.error(f"[ResourceManager] Error starting: {e}")
            finally:
                db.close()

    def _enter_gaming_mode(self):
        """Action executed when a game is detected."""
        if self.is_gaming:
            return
            
        logger.warning("[ResourceManager] !!! GAMING MODE ACTIVATED !!!")
        self.is_gaming = True
        
        # Para serviços pesados
        try:
            # Stop embeddings server first
            from ai.embeddings import embeddings
            embeddings.stop()
            
            stop_server() # Llama.cpp (main LLM)
            tts.stop_all() # TTS
            logger.info("[ResourceManager] Heavy services suspended successfully.")
            
            # NOVO: Notificar FastAPI que está em gaming mode
            try:
                from app_state import set_gaming_mode
                set_gaming_mode(True)
            except ImportError:
                pass
            
            # NOVO: Garbage collection agressivo
            logger.info("[ResourceManager] Running aggressive garbage collection...")
            gc.collect()
            
            # NOVO: Descarregar módulos opcionais da memória
            logger.info("[ResourceManager] Unloading optional modules...")
            modules_to_unload = [
                'langchain', 'langchain_core', 'langgraph', 
                'embeddings', 'services.reminders', 'services.extensions'
            ]
            for mod_name in modules_to_unload:
                if mod_name in sys.modules:
                    try:
                        del sys.modules[mod_name]
                        logger.debug(f"[ResourceManager] Unloaded module: {mod_name}")
                    except Exception as e:
                        logger.warning(f"[ResourceManager] Failed to unload {mod_name}: {e}")
            
            # Final memory compaction
            gc.collect()
            
            if self.on_notify_callback:
                self.on_notify_callback("active")
                
        except Exception as e:
            logger.error(f"[ResourceManager] Error suspending services: {e}")

    def _exit_gaming_mode(self):
        """Action executed when the game is closed."""
        if not self.is_gaming:
            return
            
        logger.info("[ResourceManager] Gaming mode disabled. Restoring systems...")
        self.is_gaming = False
        
        try:
            # NOVO: Notificar FastAPI que saiu do gaming mode
            try:
                from app_state import set_gaming_mode
                set_gaming_mode(False)
            except ImportError:
                pass
            
            # Stop embeddings first before restarting
            from ai.embeddings import embeddings
            embeddings.stop()
            time.sleep(0.3)  # Brief buffer to ensure port is free
            
            # Restaura o motor local se ele estava sendo usado
            if orchestrator.llm_mode == "local":
                logger.info("[ResourceManager] Restoring Local Llama engine...")
                orchestrator.initialize_llm("local")
            
            # Restart embeddings
            logger.info("[ResourceManager] Restarting embeddings server...")
            embeddings.restart()
            
            # Reinicia workers de TTS
            tts.start_workers()
            
            # NOVO: Garbage collection após reload
            gc.collect()

            if self.on_notify_callback:
                self.on_notify_callback("inactive")
                
        except Exception as e:
            logger.error(f"[ResourceManager] Error during gaming mode exit: {e}")

    def stop(self):
        """
        Stops all resource management services.
        Called during application shutdown to ensure clean termination.
        """
        logger.info("[ResourceManager] Stopping resource manager...")
        try:
            # Stop embeddings server
            from ai.embeddings import embeddings
            embeddings.stop()
            
            # Stop main llama server
            stop_server()
            
            # Stop TTS
            tts.stop_all()
            
            # FortScript thread is daemon, will die with process
            logger.info("[ResourceManager] Resource manager stopped successfully.")
        except Exception as e:
            logger.error(f"[ResourceManager] Error during stop: {e}")

resource_manager = ResourceManager()

# Register cleanup on exit
atexit.register(resource_manager.stop)
