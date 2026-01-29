import re
import asyncio
import threading
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, trim_messages
from ai.providers.local_llama import load_model, stop_server
import tools.system_actions as tools
import os
from tools.system_actions import TOOLS
import json
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
from ai.graph.workflow import create_momai_graph
load_dotenv()
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import traceback
import logging

logger = logging.getLogger("momai.ai")

CHECKPOINT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "checkpoints.db")

# The checkpointer will be initialized by main.py in lifespan
checkpointer = None

SYSTEM_PROMPT = """You are MomAI, a sophisticated and helpful virtual assistant.
You prioritize local processing, user privacy, and efficiency. Always be polite, reliable, and ready to assist with any request on the system."""
MAX_MESSAGES = 6 # Reduced from 8 to 6 to save tokens in Cloud models
llm_mode = "waiting"
chat_history = {} # Stores temporary history if needed

def save_message_to_db(thread_id: str, role: str, content: str):
    """
    Saves a message to the SQLite database.

    Args:
        thread_id (str): The conversation thread ID.
        role (str): 'user' or 'assistant'.
        content (str): Message content.
    """
    from database.models import SessionLocal, Message
    db = SessionLocal()
    try:
        msg = Message(thread_id=thread_id, role=role, content=content)
        db.add(msg)
        db.commit()
    except Exception as e:
        print(f"[AI_core] Error saving message: {e}")
    finally:
        db.close()

def load_history_from_db(thread_id: str, limit: int = 10):
    """
    Loads history from the SQLite database (Fallback or UI).

    Args:
        thread_id (str): The conversation thread ID.
        limit (int): Maximum number of messages to load.

    Returns:
        list: List of HumanMessage and AIMessage objects.
    """
    from database.models import SessionLocal, Message
    from langchain_core.messages import HumanMessage, AIMessage
    db = SessionLocal()
    messages = []
    try:
        db_msgs = db.query(Message).filter(Message.thread_id == thread_id).order_by(Message.created_at.desc()).limit(limit).all()
        # Reverse for chronological order
        for msg in reversed(db_msgs):
            # Explicit cast to string to satisfy Pylance
            role = str(msg.role)
            content = str(msg.content)
            if role == "user":
                messages.append(HumanMessage(content=content))
            else:
                messages.append(AIMessage(content=content))
    except Exception as e:
        print(f"[AI_core] Error loading history: {e}")
    finally:
        db.close()
    return messages

async def get_graph_history(thread_id: str):
    """
    Retrieves persistent history from LangGraph.

    Args:
        thread_id (str): The conversation thread ID.

    Returns:
        list: List of messages in the state.
    """
    if momai_graph is None or checkpointer is None:
        return []
    
    config = {"configurable": {"thread_id": thread_id}}
    try:
        # Retrieve state asynchronously
        state = await momai_graph.aget_state(config)
        if state and "messages" in state.values:
            return state.values["messages"]
    except Exception as e:
        print(f"[AI_core] Error reading graph state: {e}")
    return []

async def clear_history_db(thread_id: str = None):
    """
    Clears database history and LangGraph memory.

    Args:
        thread_id (str, optional): The thread ID to clear. If None, clears all.
    """
    from database.models import SessionLocal, Message
    import aiosqlite
    
    # 1. Clear visual history (momai.db)
    db = SessionLocal()
    try:
        if thread_id:
            num = db.query(Message).filter(Message.thread_id == thread_id).delete()
            print(f"[AI_core] Deleted {num} messages from momai.db (thread: {thread_id})")
        else:
            num = db.query(Message).delete()
            print(f"[AI_core] Deleted {num} messages from momai.db (all)")
        db.commit()
    except Exception as e:
        print(f"[AI_core] Error clearing DB history: {e}")
    finally:
        db.close()

    # 2. Clear Graph memory (checkpoints.db) asynchronously
    try:
        async with aiosqlite.connect(CHECKPOINT_PATH, timeout=10) as conn:
            # Enable WAL to avoid "Database Is Locked"
            await conn.execute("PRAGMA journal_mode=WAL")
            if thread_id:
                await conn.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
                await conn.execute("DELETE FROM writes WHERE thread_id = ?", (thread_id,))
            else:
                await conn.execute("DELETE FROM checkpoints")
                await conn.execute("DELETE FROM writes")
            await conn.commit()
            print(f"[AI_core] Graph memory cleared for thread: {thread_id or 'all'}")
    except Exception as e:
        print(f"[AI_core] Error clearing checkpoints: {e}")

    # 3. Clear in-memory cache
    global chat_history
    if thread_id:
        if thread_id in chat_history:
            del chat_history[thread_id]
    else:
        chat_history = {}

llm = None
llm_with_tools = None
momai_graph = None
llm_mode = "waiting"
is_loading = False
init_error = None
_init_lock = threading.Lock()
chat_history = {} # Temporary history for fallback

def get_api_key(provider: str) -> str | None:
    """
    Retrieves an API key from the database.

    Args:
        provider (str): 'groq' or 'gemini'.

    Returns:
        str | None: The API key if found.
    """
    from database.models import SessionLocal, Settings
    db = SessionLocal()
    try:
        s = db.query(Settings).first()
        if s and s.api_keys:
            import json
            keys_str = str(s.api_keys)
            keys = json.loads(keys_str)
            return keys.get(provider)
    except Exception as e:
        print(f"[AI_core] Error fetching API key for {provider}: {e}")
    finally:
        db.close()
    return None

def initialize_llm(mode: str):
    """
    Initializes the LLM in a separate thread.

    Args:
        mode (str): The provider mode ('local', 'groq', 'gemini').
    """
    global is_loading, llm_mode, init_error
    
    if mode == "waiting":
        llm_mode = "waiting"
        return

    if is_loading and llm_mode == mode:
        return

    is_loading = True
    llm_mode = mode 
    init_error = None

    thread = threading.Thread(target=_initialize_llm_task, args=(mode,))
    thread.daemon = True
    thread.start()


def _initialize_llm_task(mode: str):
    """Tarefa interna para inicializar o LLM e reconstruir o grafo."""
    global llm, llm_with_tools, llm_mode, momai_graph, is_loading, init_error
    
    import main
    import asyncio

    def report_progress(status: str):
        print(f"[AI_core] {status}")
        if main.main_loop:
            asyncio.run_coroutine_threadsafe(
                main.broadcast_to_sockets({
                    "type": "model_change_progress", 
                    "data": {"mode": mode, "status": status}
                }), 
                main.main_loop
            )

    try:
        mode = mode.lower()
        print(f"\n--- Inicializando Motor de IA: {mode.upper()} ---")
        report_progress("Iniciando transição...")

        # Busca configurações atuais para o Grafo
        from database.models import SessionLocal, Settings
        db = SessionLocal()
        s = db.query(Settings).first()
        u_name = str(s.user_name) if s else "Senhor"
        u_persona = str(s.assistant_persona) if s else None
        db.close()

        new_llm = None
        if mode == "local":
            report_progress("Configurando motor Llama.cpp...")
            new_llm = load_model(
                repo_id="unsloth/Qwen3-4B-Instruct-2507-GGUF",
                filename="Qwen3-4B-Instruct-2507-Q6_K.gguf",
                on_progress=report_progress
            )
        elif mode == "groq":
            report_progress("Conectando ao Groq Cloud...")
            key = get_api_key("groq")
            if not key:
                raise ValueError("API Key do Groq não encontrada nas configurações.")
            from langchain_groq import ChatGroq
            new_llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=key)
        elif mode == "gemini":
            report_progress("Conectando ao Google Gemini...")
            key = get_api_key("gemini")
            if key:
                import os
                os.environ["GOOGLE_API_KEY"] = key
            else:
                raise ValueError("API Key do Gemini não encontrada.")
            new_llm = init_chat_model("gemini-2.5-flash-lite", model_provider="google_genai")
        else:
            raise ValueError(f"Provedor de IA desconhecido: {mode}")

        if new_llm:
            print(f"[AI_core] Modelo {mode} instanciado. Reconstruindo Grafo...")
            report_progress("Reconstruindo Grafo de Agentes...")
            
            try:
                # Reconstroi o Grafo com novo LLM e configurações
                new_graph = create_momai_graph(new_llm, user_name=u_name, assistant_persona=u_persona, checkpointer=checkpointer)
                
                # ATOMIC UPDATE
                with _init_lock:
                    llm = new_llm 
                    llm_with_tools = new_llm.bind_tools(TOOLS)
                    momai_graph = new_graph
                    llm_mode = mode
                    tools.current_mode = mode
                    init_error = None
                
                report_progress("Tudo pronto, Senhor!")
                print(f"[AI_core] Motor de IA {mode} está pronto!")
            except Exception as graph_err:
                print(f"[AI_core] Erro na Reconstrução do Grafo: {graph_err}")
                raise graph_err
            
            # Notifica o frontend
            if main.main_loop:
                asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": mode}}), main.main_loop)
                main.set_graph_state(None, False)
            
        else:
            raise Exception(f"Provedor {mode} não retornou uma instância válida.")

    except Exception as e:
        err_msg = str(e)
        print(f"[AI_core] Erro Crítico de Inicialização: {err_msg}")
        init_error = err_msg
        is_loading = False
        
        if main.main_loop:
            asyncio.run_coroutine_threadsafe(
                main.broadcast_to_sockets({"type": "model_change_error", "data": {"message": err_msg}}), 
                main.main_loop
            )
    finally:
        is_loading = False


class ChatMessage(BaseModel):
    content: str
    thread_id: str = "default"


def clean_text_for_tts(text: str) -> str:
    """
    Removes Markdown formatting and special characters for natural voice.

    Args:
        text (str): Input text.

    Returns:
        str: Cleaned text for TTS.
    """
    # Remove <think> tags and content
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    # Remove bold/italic
    text = re.sub(r'[*_]{1,3}([^*_]+)[*_]{1,3}', r'\1', text)
    # Remove links
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1', text)
    # Remove headers
    text = re.sub(r'#+\s?', '', text)
    # Remove code blocks
    text = re.sub(r'`+', '', text)
    # Remove function tags (fallback XML)
    text = re.sub(r'<function=.*?>.*?</function>', '', text, flags=re.DOTALL)
    # Remove bullet markers
    text = re.sub(r'^\s*[-*]\s+', '', text, flags=re.MULTILINE)

    return text.strip()


def clean_response(text: str) -> str:
    """
    Cleans residual tokens and terminal-breaking characters.

    Args:
        text (str): Raw model response.

    Returns:
        str: Cleaned response.
    """
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    text = re.sub(r'<\|.*?\|>', '', text).strip()
    text = re.sub(r'<function=.*?>.*?</function>', '', text, flags=re.DOTALL).strip()
    text = re.sub(r'^(MomAI|Assistant|Assistente)\s* : \s*', 
                  '', text, flags=re.IGNORECASE).strip()
    # Remove non-BMP emojis for Windows terminal compatibility
    text = "".join(c for c in text if ord(c) <= 0xFFFF)
    return text




async def generate(message: ChatMessage):
    """
    Main stream generator for chat responses.
    """
    import services.voice.tts as tts
    tts.stop_all()
    tts.start_workers()
    print(f"\n[AI_core] Nova Requisição: {message.content}")

    if is_loading or llm is None or momai_graph is None:
        status_mode = llm_mode if llm_mode != "waiting" else "inicial"
        msg = f"Aguarde um momento, Senhor. Estou configurando meu motor para o modo {status_mode}."
        yield f"data: {json.dumps({'error': msg})}\n\n"
        return

    try:
        config = {"configurable": {"thread_id": message.thread_id}, "recursion_limit": 50}
        save_message_to_db(message.thread_id, "user", message.content)

        tts_buffer = ""
        # Padrão refinado: foca em terminadores de frase reais para manter a fluidez
        sentence_end_pattern = re.compile(r'(.*?[.?!;])(?:\s+|$)|(.*\n\n)', re.DOTALL)
        full_content = ""
        is_thinking = False

        input_data = {"messages": [HumanMessage(content=message.content)]}

        async for event in momai_graph.astream_events(input_data, config=config, version="v2"):
            if is_loading: break

            kind = event["event"]
            name = event["name"]
            metadata = event.get("metadata", {})
            node_name = metadata.get("langgraph_node", "")

            # Log todos os eventos de chain/node no terminal para depuração
            if kind in ["on_chain_start", "on_node_start"]:
                logger.info(f"[GraphEvent] {kind}: {name} (node: {node_name})")

            # Status for UI
            if (kind == "on_chain_start" or kind == "on_node_start"):
                if "semantic_router" in name or node_name == "semantic_router":
                    yield f"data: {json.dumps({'status': 'Router: Analyzing intent...'})}\n\n"
                
                elif "mom_orchestrator" in name or node_name == "mom_orchestrator":
                    yield f"data: {json.dumps({'status': 'Orchestrator: Planning action...'})}\n\n"

                elif "specialist_node" in name or node_name == "specialist_node":
                    yield f"data: {json.dumps({'status': 'Specialist: Processing request...'})}\n\n"

            if kind == "on_tool_start":
                logger.info(f"[AI_core] Executing tool: {name}")
                yield f"data: {json.dumps({'status': f'Executing: {name}'})}\n\n"
            
            if kind == "on_tool_end":
                logger.info(f"[AI_core] Tool {name} finished.")
                yield f"data: {json.dumps({'status': None})}\n\n"

            
            if kind == "on_chat_model_stream":
                metadata = event.get("metadata", {})
                node = metadata.get("langgraph_node", "")
                
                # Bloqueio total de nós técnicos (Roteador e Orquestrador)
                if node in ["semantic_router", "mom_orchestrator", "router"]:
                    continue

                content = event["data"]["chunk"].content
                if not content: continue

                # Filtro de Pensamento (DeepSeek/Qwen tags)
                if "<think>" in content: is_thinking = True; continue
                if "</think>" in content: is_thinking = False; continue
                if is_thinking: continue

                # Filtro de JSON e Chamadas de Funções Hallucinadas
                raw_token = content.strip()
                if raw_token.startswith('{') or raw_token.startswith('}'): continue
                if raw_token.startswith('"next"'): continue

                filtered_content = "".join(c for c in content if ord(c) <= 0xFFFF)
                if filtered_content:
                    # Se for o início da resposta, limpa prefixos
                    if not full_content:
                        clean_chunk = re.sub(r'^(MomAI|Assistente|Assistant|MomAgent|IA)\s*:?\s*', '', filtered_content, flags=re.IGNORECASE)
                        if not clean_chunk.strip() and len(filtered_content) < 15:
                            full_content += filtered_content 
                            continue
                        filtered_content = clean_chunk
                    
                    full_content += filtered_content
                    yield f"data: {json.dumps({'token': filtered_content})}\n\n"
                    tts_buffer += filtered_content
                    
                    # Processamento para TTS
                    while True:
                        match = sentence_end_pattern.search(tts_buffer)
                        if match:
                            sentence = (match.group(1) or match.group(2)).strip()
                            tts_buffer = tts_buffer[match.end():]
                            if len(sentence) > 2:
                                clean_sent = clean_text_for_tts(sentence)
                                if clean_sent: tts.speak_sentence(clean_sent)
                        elif len(tts_buffer) > 120: 
                            last_space = tts_buffer.rfind(" ")
                            if last_space != -1 and last_space > 60:
                                sentence = tts_buffer[:last_space].strip()
                                tts_buffer = tts_buffer[last_space:].strip()
                                clean_sent = clean_text_for_tts(sentence)
                                if clean_sent: tts.speak_sentence(clean_sent)
                            else: break
                        else: break

            elif kind == "on_chat_model_end":
                metadata = event.get("metadata", {})
                node = metadata.get("langgraph_node", "")
                
                # Só processa fallback se for um nó de comunicação com o humano
                if node in ["specialist_node", "responder"]:
                    output = event["data"].get("output")
                    if output and hasattr(output, "content") and output.content:
                        if not full_content:
                            content = clean_response(output.content)
                            # Se o conteúdo final for apenas código/ferramenta, não exibe como texto
                            if content and '{"next":' not in content and 'show_graph(' not in content:
                                full_content = content
                                yield f"data: {json.dumps({'token': content})}\n\n"
                                clean_sent = clean_text_for_tts(content)
                                if clean_sent: tts.speak_sentence(clean_sent)

            elif kind == "on_chain_end" and name == "mom_orchestrator":
                output = event["data"].get("output")
                if output and isinstance(output, dict):
                    next_agent = output.get("next")
                    if next_agent and next_agent != "responder":
                         print(f"[AI_core] Routing to: {next_agent}")
                         yield f"data: {json.dumps({'status': f'Consulting {next_agent}...'})}\n\n"

    except Exception as e:
        error_msg = str(e)
        print(f"[AI_core] Erro de Stream: {error_msg}")
        
        if "429" in error_msg or "rate_limit" in error_msg.lower():
            friendly_error = "Sir, I have reached the Groq processing limit for this minute. Please wait a few seconds before trying again."
            yield f"data: {json.dumps({'error': friendly_error})}\n\n"
            tts.speak_sentence("Sorry, Sir. I need a short break due to rate limits.")
        else:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"

    finally:
        final_reply = clean_response(full_content)
        if final_reply.strip():
            save_message_to_db(message.thread_id, "assistant", final_reply)

        if tts_buffer.strip():
            clean_phrase = clean_text_for_tts(clean_response(tts_buffer)).strip()
            if len(clean_phrase) > 1:
                tts.speak_sentence(clean_phrase)

        yield f"data: {json.dumps({'done': True})}\n\n"
        
        