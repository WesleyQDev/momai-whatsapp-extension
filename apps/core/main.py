from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_community.chat_models import ChatLlamaCpp
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, trim_messages
from huggingface_hub import hf_hub_download
from dotenv import load_dotenv
import multiprocessing
import re
import json
load_dotenv()


SYSTEM_PROMPT = """Voce é MomAI, uma assistente virtual criada por WesleyQDev. Diferente de assistentes comuns, o usuario terá controle total sobre quais funcionalidades instalar e onde seus dados são armazenados.
Responda sempre com mensagens curtas
"""

chat_history: dict[str, list] = {}
MAX_MESSAGES = 5

llm = None
try:
    # Qwen3-4B Instruct GGUF
    repo_id = "Qwen/Qwen3-4B-GGUF"
    filename = "Qwen3-4B-Q4_K_M.gguf"

    print(f"Baixando modelo: {repo_id}")
    model_path = hf_hub_download(repo_id=repo_id, filename=filename)

    llm = ChatLlamaCpp(
        model_path=model_path,
        n_gpu_layers=-1, 
        n_ctx=8192, 
        n_batch=1024,  
        temperature=0.7,
        max_tokens=1024,
        n_threads=multiprocessing.cpu_count(),  
        repeat_penalty=1.1,
        top_p=0.9,
        verbose=False,
        streaming=True,
        use_mmap=True, 
        use_mlock=True,
    )
    print("Modelo local carregado com sucesso!")
except Exception as e:
    print(f"Erro ao carregar modelo local: {e}")
    llm = None


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    content: str
    thread_id: str = "default"


def get_trimmed_messages(thread_id: str, new_message: str) -> list:
    """Retorna mensagens com trim para não exceder o limite."""
    # Pega histórico existente ou cria novo
    if thread_id not in chat_history:
        chat_history[thread_id] = []

    history = chat_history[thread_id]

    # Adiciona nova mensagem do usuário
    history.append(HumanMessage(content=new_message))

    # Aplica trim_messages para manter apenas as últimas mensagens
    trimmed = trim_messages(
        history,
        max_tokens=MAX_MESSAGES,
        token_counter=len,  # Conta por número de mensagens
        strategy="last",
        start_on="human",
        include_system=False,
    )

    # Constrói lista final com system prompt
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + trimmed
    return messages


def clean_response(text: str) -> str:
    """Limpa tokens residuais da resposta."""
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    text = re.sub(r'<\|.*?\|>', '', text).strip()
    text = re.sub(r'^(MomAI|Assistant|Assistente)\s*:\s*', '', text, flags=re.IGNORECASE).strip()
    return text


@app.post("/chat")
def handle_chat(message: ChatMessage):
    if not llm:
        return {"reply": "Modelo não disponível"}
    try:
        print(f"Processando: {message.content} (thread: {message.thread_id})")

        # Obtém mensagens com memória e trim
        messages = get_trimmed_messages(message.thread_id, message.content)

        response = llm.invoke(messages)
        content = response.content if isinstance(response.content, str) else str(response.content)
        reply = clean_response(content)

        # Salva resposta no histórico
        chat_history[message.thread_id].append(AIMessage(content=reply))

        return {"reply": reply}

    except Exception as e:
        print(f"Erro na IA: {e}")
        return {"reply": f"Erro: {str(e)}"}


@app.post("/chat/stream")
async def handle_chat_stream(message: ChatMessage):
    """Endpoint com streaming de resposta."""
    if not llm:
        return {"error": "Modelo não disponível"}

    async def generate():
        try:
            messages = get_trimmed_messages(message.thread_id, message.content)
            full_response = ""
            inside_think = False
            first_token = True

            for chunk in llm.stream(messages):  # type: ignore
                token = chunk.content
                if not token or not isinstance(token, str):
                    continue

                # Detecta início do bloco think
                if "<think>" in token:
                    inside_think = True
                    continue

                # Detecta fim do bloco think
                if "</think>" in token:
                    inside_think = False
                    first_token = True  # Próximo token pode ter espaços extras
                    continue

                # Ignora tokens dentro do think
                if inside_think:
                    continue

                # Ignora tokens especiais
                if "<|" in token or "|>" in token:
                    continue

                # Remove espaços do início após sair do think
                if first_token:
                    token = token.lstrip()
                    first_token = False
                    if not token:
                        continue

                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            # Limpa e salva resposta final
            final_reply = clean_response(full_response)
            if message.thread_id in chat_history:
                chat_history[message.thread_id].append(AIMessage(content=final_reply))

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            print(f"Erro no stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.delete("/chat/{thread_id}")
def clear_history(thread_id: str):
    """Limpa o histórico de uma thread específica."""
    if thread_id in chat_history:
        del chat_history[thread_id]
        return {"status": "cleared"}
    return {"status": "not_found"}


@app.get("/status")
def get_status():
    return {
        "status": "online",
        "version": "V0.1.0",
        "model": "local" if llm else "none"
    }
