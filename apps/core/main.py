import sys
import io

# Força o console do Windows a usar UTF-8 para evitar erros de 'charmap'
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from AI_core import generate
from dotenv import load_dotenv
from pydantic import BaseModel
import tomllib
from pathlib import Path
from AI_core import initialize_llm
import AI_core
import tools


class ChatMessage(BaseModel):
    content: str
    thread_id: str = "default"


class ModeChange(BaseModel):
    mode: str


load_dotenv()

# Sincroniza versão com as tools no startup
try:
    pyproject_path = Path(__file__).parent / "pyproject.toml"
    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)
        __version__ = data.get("project", {}).get("version", "0.0.0")
        tools.version = __version__
except Exception:
    __version__ = "0.0.0"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat/stream")
async def handle_chat_stream(message: ChatMessage):
    return StreamingResponse(
        generate(message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/status")
def get_status():
    return {
        "status": "ok",
        "version": tools.version,
        "mode": AI_core.llm_mode,
    }


@app.post("/mode")
def set_mode(mode_data: ModeChange):
    print(f"[FastAPI] Recebendo requisição para mudar modo: {mode_data.mode}")
    new_llm = initialize_llm(mode_data.mode)
    print(f"[FastAPI] Modo alterado para: {AI_core.llm_mode}")
    return {"status": "ok", "mode": AI_core.llm_mode, "initialized": new_llm is not None}
