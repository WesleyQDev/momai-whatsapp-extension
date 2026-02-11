import os
import logging
# Force offline mode for all HuggingFace-based modules (TTS, LLM, Embeddings)
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from runtime import configure_logging, install_uvicorn_access_filter, patch_thread_start
from startup import lifespan

configure_logging()
install_uvicorn_access_filter()
patch_thread_start()

logger = logging.getLogger(__name__)

app = FastAPI(lifespan=lifespan)
load_dotenv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn

    should_reload = os.getenv("MOMAI_DEBUG", "false").lower() == "true"
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))

    logger.info("[Main] Starting MomAI Core on %s:%s (Reload: %s)", host, port, should_reload)
    uvicorn.run("main:app", host=host, port=port, reload=should_reload)
