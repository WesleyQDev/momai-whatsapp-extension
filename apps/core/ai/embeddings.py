import os
import asyncio
import json
import time
import requests
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from huggingface_hub import hf_hub_download
import numpy as np
from functools import lru_cache
import logging

logger = logging.getLogger("momai.embeddings")

MODELS_DIR = Path(__file__).parent.parent / "models"
MODEL_REPO = "Qwen/Qwen3-Embedding-0.6B-GGUF"
MODEL_FILE = "Qwen3-Embedding-0.6B-Q8_0.gguf"

class EmbeddingEngine:
    _instance = None
    _model = None
    _executor = ThreadPoolExecutor(max_workers=1)
    _cache = {}

    _process = None
    _port = 8081

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingEngine, cls).__new__(cls)
        return cls._instance

    def _get_paths(self):
        """Get paths of binaries and models."""
        base_dir = Path(__file__).parent.parent
        # try to get backend from db
        try:
            from database.models import SessionLocal, Settings
            db = SessionLocal()
            s = db.query(Settings).first()
            backend = s.local_backend if s and s.local_backend != "auto" else None
            db.close()
        except:
            backend = None

        if not backend:
            # Auto-detect best installed
            from utils.downloader import get_installed_info
            info = get_installed_info()
            backend = info.get("backend", "cpu")

        exe_path = base_dir / "bin" / backend / "llama-server.exe"
        if not exe_path.exists():
            # Fallback
            for b in ["vulkan", "cpu"]:
                p = base_dir / "bin" / b / "llama-server.exe"
                if p.exists():
                    exe_path = p
                    break
        
        return {
            "exe": str(exe_path),
            "models": str(base_dir / "models")
        }

    def _get_model_path(self):
        """Ensure the model exists and returns the path."""
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        model_path = MODELS_DIR / MODEL_FILE
        
        if not model_path.exists():
            print(f"[Embeddings] Downloading model {MODEL_FILE} from {MODEL_REPO}...")
            hf_hub_download(
                repo_id=MODEL_REPO,
                filename=MODEL_FILE,
                local_dir=MODELS_DIR
            )
        return str(model_path.resolve())

    def load(self):
        """Ensure the llama-server for embeddings is running."""
        if self._process is None:
            # Check if something is already running on port 8081
            try:
                res = requests.get(f"http://127.0.0.1:{self._port}/health", timeout=1)
                if res.status_code == 200:
                    self._process = True # indicates that the server is ready
                    return
            except:
                pass

            paths = self._get_paths()
            model_path = self._get_model_path()
            
            print(f"[Embeddings] Starting llama-server for embeddings on port {self._port}...")
            
            cmd = [
                paths["exe"],
                "-m", model_path,
                "--port", str(self._port),
                "--embedding",
                "--ctx-size", "2048",
                "--n-gpu-layers", "-1",
                "--parallel", "1",
                "--threads", str(os.cpu_count() or 4),
                "--no-mmap"
            ]
            
            # Silences the embeddings server output
            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )

            # Aguarda healthcheck
            for _ in range(30): # 15 segundos max
                try:
                    res = requests.get(f"http://127.0.0.1:{self._port}/health", timeout=0.5)
                    if res.status_code == 200:
                        print("[Embeddings] Servidor de embeddings pronto!")
                        break
                except:
                    pass
                time.sleep(0.5)
        
        return self._process

    async def embed_text(self, text: str) -> list[float]:
        """Transforms a text into an embedding vector asynchronously with cache."""
        clean_text = text.strip().lower()
        if clean_text in self._cache:
            return self._cache[clean_text]

        loop = asyncio.get_running_loop()
        embedding = await loop.run_in_executor(self._executor, self._embed_sync, text)
        
        # Cache simple/short texts (up to 200 items to avoid memory bloat)
        if len(self._cache) < 200:
            self._cache[clean_text] = embedding
            
        return embedding

    def _embed_sync(self, text: str) -> list[float]:
        """Internal synchronous version for the executor."""
        self.load()
        try:
            response = requests.post(
                f"http://127.0.0.1:{self._port}/embedding",
                json={"content": text},
                timeout=10
            )
            data = response.json()
            vec = []

            # Case: OpenAI format {'data': [{'embedding': ...}]}
            if isinstance(data, dict) and 'data' in data and isinstance(data['data'], list):
                vec = data['data'][0]['embedding']
            
            # Case: Simple format {'embedding': [...]} 
            elif isinstance(data, dict) and 'embedding' in data:
                vec = data['embedding']
            
            # Case: Direct list [0.1, 0.2, ...] or [[0.1, ...]]
            elif isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], list):
                    vec = data[0]
                elif isinstance(data[0], dict):
                    vec = data[0].get('embedding', [])
                else:
                    vec = data

            if not vec or len(vec) < 10:
                return [0.0] * 1024
            
            # Ensure float32 to avoid Arrow cast errors
            return np.array(vec, dtype=np.float32).tolist()

        except Exception as e:
            print(f"[Embeddings] Erro ao obter embedding: {e}")
            return [0.0] * 1024 # Fallback vector

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Transforms a list of texts into a list of embeddings asynchronously."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._embed_docs_sync, texts)

    def _embed_docs_sync(self, texts: list[str]) -> list[list[float]]:
        """Internal synchronous version for the executor."""
        self.load()
        try:
            response = requests.post(
                f"http://127.0.0.1:{self._port}/embedding",
                json={"content": texts},
                timeout=30
            )
            data = response.json()
            results = []
            
            # Case: OpenAI format {'data': [{'embedding': ...}]}
            if isinstance(data, dict) and 'data' in data:
                results = [r['embedding'] for r in data['data']]
            
            # Case: Simple list of embeddings
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, list):
                        results.append(item)
                    elif isinstance(item, dict):
                        results.append(item.get('embedding', [0.0] * 1024))
            
            if not results:
                return [[0.0] * 1024] * len(texts)
                
            return [np.array(v, dtype=np.float32).tolist() for v in results]
        except:
            return [self._embed_sync(t) for t in texts]

    def stop(self):
        """
        Stops the embeddings llama-server gracefully.
        First attempts graceful termination (2 seconds), then force-kills if needed.
        """
        if self._process is None or self._process is True:
            # _process can be True (healthcheck found running server) or None (not started)
            logger.info("[Embeddings] Server already stopped or never started.")
            return

        logger.warning("[Embeddings] Stopping embeddings server on port 8081...")
        try:
            # Attempt graceful termination
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
                logger.info("[Embeddings] Server stopped gracefully.")
            except subprocess.TimeoutExpired:
                # If graceful fails, force kill
                logger.warning("[Embeddings] Graceful shutdown timeout. Force-killing...")
                self._process.kill()
                try:
                    self._process.wait(timeout=1)
                    logger.info("[Embeddings] Server force-killed successfully.")
                except subprocess.TimeoutExpired:
                    logger.error("[Embeddings] Force-kill timeout!")
        except Exception as e:
            logger.error(f"[Embeddings] Error stopping server: {e}")
        finally:
            self._process = None
            self._cache.clear()
            logger.info("[Embeddings] Cache cleared.")

    def restart(self):
        """
        Restarts the embeddings server.
        Useful after gaming mode ends to restore service.
        """
        logger.info("[Embeddings] Restarting embeddings server...")
        self.stop()
        time.sleep(0.5)  # Brief pause to ensure port is free
        self.load()
        logger.info("[Embeddings] Embeddings server restarted.")

    def __del__(self):
        """
        Destructor to ensure cleanup if garbage collected.
        Fallback mechanism to prevent zombie processes.
        """
        try:
            if self._process is not None and self._process is not True:
                logger.warning("[Embeddings] Destructor cleanup: stopping server...")
                self._process.kill()
                self._process = None
        except:
            pass

    def clear_all_cache(self):
        """
        Clear all cache and free memory.
        Called during garbage collection or gaming mode.
        """
        logger.info("[Embeddings] Clearing cache and freeing memory...")
        try:
            cache_size = len(self._cache)
            self._cache.clear()
            self._model = None
            
            # Force Python garbage collection
            import gc
            gc.collect()
            
            logger.info(f"[Embeddings] Cleared {cache_size} cache entries.")
        except Exception as e:
            logger.error(f"[Embeddings] Error clearing cache: {e}")

    def memory_stats(self):
        """
        Get memory statistics for monitoring.
        Returns dict with cache size and process memory.
        """
        try:
            import psutil
            process = psutil.Process()
            mem_info = process.memory_info()
            
            return {
                "cache_size": len(self._cache),
                "process_memory_mb": mem_info.rss / (1024 * 1024),
                "process_running": self._process is not None and self._process is not True,
                "port": self._port
            }
        except Exception as e:
            logger.error(f"[Embeddings] Error getting memory stats: {e}")
            return {"error": str(e)}

# Singleton instance
embeddings = EmbeddingEngine()