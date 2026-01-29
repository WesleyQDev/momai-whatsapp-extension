import sys
import os
import threading
import logging
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
        self.is_gaming = False
        self.on_notify_callback = None # Callback to notify the UI (via websocket)
        self.initialized = True

    def start(self):
        """Initializes FortScript monitoring in a separate thread."""
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
            stop_server() # Llama.cpp
            tts.stop_all() # TTS
            logger.info("[ResourceManager] Heavy services suspended successfully.")
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
        
        # Restaura o motor local se ele estava sendo usado
        if orchestrator.llm_mode == "local":
            logger.info("[ResourceManager] Restoring Local Llama engine...")
            orchestrator.initialize_llm("local")
        
        # Reinicia workers de TTS
        tts.start_workers()

        if self.on_notify_callback:
            self.on_notify_callback("inactive")

    def stop(self):
        """Stops the monitoring."""
        if self.fs:
            # FortScript doesn't have a direct 'stop' method in the infinite loop yet 
            # (it runs while True). But since it's a daemon thread, it dies with the process.
            pass

resource_manager = ResourceManager()
