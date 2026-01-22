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
from AI_core import generate
from dotenv import load_dotenv
from pydantic import BaseModel
import tomllib
from pathlib import Path
from AI_core import initialize_llm
import AI_core
import tools
from wake_word import WakeWordDetector
import threading
import os
import psutil
import json
import asyncio

# Gerenciador de Websockets
active_websockets: list[WebSocket] = []
main_loop: asyncio.AbstractEventLoop = None


async def process_voice_command(text: str):
    """Processa comando de voz e envia resposta via WebSocket"""
    if not text:
        return

    print(f"[Voice] Processando: {text}")

    # 1. Avisa o front que usuário falou algo
    print(
        f"[Voice] Enviando texto do usuário para {len(active_websockets)} sockets")
    for ws in active_websockets:
        try:
            await ws.send_json({"type": "user", "content": text})
        except Exception as e:
            print(f"[Voice] Erro ao enviar para socket: {e}")

    # 2. Gera resposta da IA
    msg = ChatMessage(content=text, thread_id="voice")

    # Consome o generator do AI_core
    # Nota: generate() retorna strings 'data: {json}\n\n' (SSE format)
    # Vamos parsear isso para enviar JSON limpo no WebSocket
    try:
        async for chunk in generate(msg):
            if chunk.startswith("data: "):
                json_str = chunk.replace("data: ", "").strip()
                if not json_str:
                    continue

                try:
                    data = json.loads(json_str)

                    # Envia para todos os clientes conectados
                    for ws in active_websockets:
                        try:
                            await ws.send_json({"type": "assistant", "data": data})
                        except Exception as e:
                            print(f"[Voice] Erro ao enviar chunk IA: {e}")
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        print(f"Erro processando voz: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # Callback executado na thread do WakeWord
    # Callback executado na thread do WakeWord
    def on_wake_word(text):
        global main_loop
        try:
            # Agenda a execução da async function no loop principal de forma thread-safe
            if main_loop and main_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    process_voice_command(text), main_loop)
            else:
                print("Erro: Main loop não está rodando")
        except Exception as e:
            print(f"Erro no callback de voz: {e}")

    # Captura o loop principal
    global main_loop
    main_loop = asyncio.get_running_loop()

    print("[FastAPI] Iniciando serviço de Wake Word (palavra-chave: 'Sistema')...")
    ww = WakeWordDetector(keyword="Sistema", callback=on_wake_word)
    ww.start()

    # Thread para monitorar o processo pai (Electron) no Windows
    def monitor_parent():
        parent = psutil.Process(os.getpid()).parent()
        if parent:
            parent.wait()
            print("[FastAPI] Processo pai encerrado. Saindo...")
            os._exit(0)

    if sys.platform == "win32":
        threading.Thread(target=monitor_parent, daemon=True).start()

    yield
    # Shutdown
    print("[FastAPI] Encerrando aplicação e limpando recursos...")
    ww.stop()
    try:
        from local_model import stop_server
        stop_server()
    except Exception as e:
        print(f"Erro ao parar servidor local: {e}")

    try:
        import tts_manager
        tts_manager.stop_all()
    except Exception as e:
        print(f"Erro ao parar TTS: {e}")


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

app = FastAPI(lifespan=lifespan)

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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        while True:
            # Mantém conexão viva e (opcional) recebe comandos de texto via socket
            data = await websocket.receive_text()
            # Se quiser suportar chat via socket, processa 'data' aqui
    except WebSocketDisconnect:
        print("[FastAPI] WebSocket desconectado")
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception as e:
        print(f"[FastAPI] Erro no WebSocket: {e}")
        if websocket in active_websockets:
            active_websockets.remove(websocket)
