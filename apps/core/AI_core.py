import re
import asyncio
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, trim_messages
from local_model import load_model, stop_server
import tools
from tools import TOOLS
import json
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
from graph import create_momai_graph
load_dotenv()

SYSTEM_PROMPT = """You are MomAI, a helpful and professional virtual assistant.  
You always address the user as "Senhor." Your main characteristics are politeness and efficiency.

Always respond in Brazilian Portuguese (PT-BR).  
Keep a natural and direct tone of voice.
"""
chat_history: dict[str, list] = {}
MAX_MESSAGES = 20
llm_mode = "groq"
llm = None
momai_graph = None


def initialize_llm(mode: str):
    global llm, llm_mode
    mode = mode.lower()
    print(f"[AI_core] Mudando modo para: {mode}")

    # Temporariamente desabilita o LLM anterior
    prev_llm = llm
    llm = None

    # Se não for modo local, garante que o servidor local esteja parado para economizar recurso
    # FIX: Não paramos o servidor se estivermos mudando de Local -> Remote, pois o loop atual
    # pode depender dele. Deixamos rodando em background.
    # if mode != "local":
    #    stop_server()

    try:
        if mode == "local":
            print("[AI_core] Carregando modelo local...")
            new_llm = load_model(
                repo_id="unsloth/Qwen3-4B-Instruct-2507-GGUF",
                filename="Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
            )
        elif mode == "groq":
            print("[AI_core] Carregando modelo Groq...")
            from langchain_groq import ChatGroq
            new_llm = ChatGroq(model="qwen/qwen3-32b")
        else:  # genai
            print("[AI_core] Carregando modelo GenAI...")
            new_llm = init_chat_model("google_genai:gemini-2.5-flash-lite")

        # Vincular ferramentas globalmente a qualquer modelo carregado
        llm = new_llm.bind_tools(TOOLS)
        llm_mode = mode
        tools.current_mode = mode

        # Reconstrói o Grafo com o novo LLM
        global momai_graph
        momai_graph = create_momai_graph(new_llm)

        print(
            f"[AI_core] Modelo {mode} pronto e Grafo Migrado!")
        return llm
    except Exception as e:
        print(f"[AI_core] Erro ao carregar modelo {mode}: {e}")
        llm = prev_llm  # Reverte em caso de erro
        return llm


# Inicialização inicial
initialize_llm(llm_mode)


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


def clean_text_for_tts(text: str) -> str:
    """
    Remove formatação Markdown e caracteres especiais para a voz ficar natural.
    """
    # Remove negrito/itálico (**texto**, *texto*, __texto__)
    text = re.sub(r'[*_]{1,3}([^*_]+)[*_]{1,3}', r'\1', text)
    # Remove links [texto](url) -> texto
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove headers (# Titulo)
    text = re.sub(r'#+\s?', '', text)
    # Remove code blocks/backticks
    text = re.sub(r'`+', '', text)
    # Remove restos de bullets
    text = re.sub(r'^\s*[-*]\s+', '', text, flags=re.MULTILINE)

    return text.strip()


def clean_response(text: str) -> str:
    """Limpa tokens residuais da resposta e remove caracteres que quebram o console Windows."""
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    text = re.sub(r'<\|.*?\|>', '', text).strip()
    text = re.sub(r'^(MomAI|Assistant|Assistente)\s*:\s*',
                  '', text, flags=re.IGNORECASE).strip()
    # Remove emojis e caracteres especiais que quebram o terminal Windows sem UTF-8
    text = "".join(c for c in text if c <= "\uFFFF")
    return text


async def generate(message: ChatMessage):
    # Import adiado para evitar ciclo
    import tts_manager

    # Para fala anterior se houver
    tts_manager.stop_all()
    tts_manager.start_workers()

    if llm is None:
        yield f"data: {json.dumps({'error': 'Modelo ainda está sendo carregado. Por favor, aguarde...'})}\n\n"
        return

    try:
        messages = get_trimmed_messages(message.thread_id, message.content)
        tts_buffer = ""
        import re
        sentence_end_pattern = re.compile(r'(.*?[.?!])(\s+|$)', re.DOTALL)

        full_content = ""
        is_thinking = False  # Flag para ignorar conteúdo de pensamento

        # Usando o Grafo com streaming de eventos
        async for event in momai_graph.astream_events({"messages": messages}, version="v2"):
            kind = event["event"]
            name = event["name"]

            if kind == "on_chat_model_stream":
                # Filtra para SÓ mostrar tokens que venham dos especialistas ou do respondedor
                # Ignora o 'mom_orchestrator' que gera o JSON de roteamento técnico
                node = event.get("metadata", {}).get("langgraph_node", "")
                if node == "mom_orchestrator":
                    continue

                content = event["data"]["chunk"].content
                if content:
                    # Lógica para detectar e filtrar conteúdo de pensamento (<think>...</think>)
                    if "<think>" in content:
                        is_thinking = True
                        continue
                    if "</think>" in content:
                        is_thinking = False
                        continue

                    if is_thinking:
                        continue

                    filtered_content = "".join(
                        c for c in content if ord(c) <= 0xFFFF)

                    if filtered_content:
                        full_content += filtered_content
                        yield f"data: {json.dumps({'token': filtered_content})}\n\n"

                        tts_buffer += filtered_content
                        # Processa TTS
                        while True:
                            match = sentence_end_pattern.search(tts_buffer)
                            if match:
                                sentence = match.group(1).strip()
                                remaining = tts_buffer[match.end():]
                                if len(sentence) > 2:
                                    clean_sentence = clean_text_for_tts(
                                        sentence)
                                    if clean_sentence.strip():
                                        tts_manager.speak_sentence(
                                            clean_sentence)
                                tts_buffer = remaining
                            else:
                                break

            # 2. Quando o Orquestrador escolhe o próximo agente
            elif kind == "on_chain_end" and name == "mom_orchestrator":
                output = event["data"].get("output")
                if output and hasattr(output, "next"):
                    next_agent = output.next
                    if next_agent != "FINISH":
                        print(f"[Supervisor] Delegando para: {next_agent}")

        # Envia resto do buffer de áudio
        if tts_buffer.strip():
            clean_phrase = clean_text_for_tts(
                clean_response(tts_buffer)).strip()
            if len(clean_phrase) > 1:
                tts_manager.speak_sentence(clean_phrase)

        # Salva a resposta final no histórico
        final_reply = clean_response(full_content)
        if message.thread_id in chat_history:
            chat_history[message.thread_id].append(
                AIMessage(content=final_reply))

        yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as e:
        print(f"Erro no stream: {e}")
        import traceback
        traceback.print_exc()
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
