import os
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from llama_cpp import Llama
from huggingface_hub import hf_hub_download
import numpy as np
from functools import lru_cache

MODELS_DIR = Path(__file__).parent.parent / "models"
MODEL_REPO = "Qwen/Qwen3-Embedding-0.6B-GGUF"
MODEL_FILE = "Qwen3-Embedding-0.6B-Q8_0.gguf"

class EmbeddingEngine:
    _instance = None
    _model = None
    _executor = ThreadPoolExecutor(max_workers=1)
    _cache = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingEngine, cls).__new__(cls)
        return cls._instance

    def _get_model_path(self):
        """Garante que o modelo existe e retorna o caminho."""
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        model_path = MODELS_DIR / MODEL_FILE
        
        if not model_path.exists():
            print(f"[Embeddings] Baixando modelo {MODEL_FILE} de {MODEL_REPO}...")
            hf_hub_download(
                repo_id=MODEL_REPO,
                filename=MODEL_FILE,
                local_dir=MODELS_DIR
            )
        return str(model_path)

    def load(self):
        """Carrega o modelo na memória se ainda não estiver carregado."""
        if self._model is None:
            model_path = self._get_model_path()
            print(f"[Embeddings] Carregando modelo de embeddings: {model_path}")
            
            # Configurações otimizadas para Embedding
            self._model = Llama(
                model_path=model_path,
                embedding=True,
                n_ctx=2048,
                n_gpu_layers=-1, 
                n_threads=os.cpu_count(),
                verbose=False
            )
        return self._model

    async def embed_text(self, text: str) -> list[float]:
        """Transforma um texto em um vetor de embeddings de forma assíncrona com cache."""
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
        """Versão síncrona interna para o executor."""
        model = self.load()
        embedding = model.create_embedding(text)
        return embedding['data'][0]['embedding']

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Transforma uma lista de textos em uma lista de vetores de forma assíncrona."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._embed_docs_sync, texts)

    def _embed_docs_sync(self, texts: list[str]) -> list[list[float]]:
        """Versão síncrona interna para o executor."""
        model = self.load()
        embeddings = model.create_embedding(texts)
        return [e['embedding'] for e in embeddings['data']]

# Singleton instance
embeddings = EmbeddingEngine()