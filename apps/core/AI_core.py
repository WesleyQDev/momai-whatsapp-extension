import re
import asyncio
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage, trim_messages
from local_model import load_model, stop_server
import tools
from tools import TOOLS, AVAILABLE_TOOLS
import json
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
load_dotenv()

SYSTEM_PROMPT = """# PERSONA
You are MomAI, a virtual assistant created by Wesley. Your personality is helpful, straightforward, and professional. You always address the user as "Senhor" (Sir).

# CAPABILITIES (Orchestrator)
You coordinate agents to control Windows/Linux, automations, Notion, Obsidian, and web searches. If you can't do something directly, say you'll request it from the responsible agent.

# RESPONSE RULES
1. Respond as if you were SPEAKING: Short, natural, and without lists.
2. Use full words for numbers when it feels natural for speech (e.g., "ten" instead of "10").
3. FORBIDDEN: Complex markdown, tables, excessive bold text, or code blocks (unless requested).
4. **CRITICAL: ALWAYS ANSWER IN PORTUGUESE (PT-BR).** Even if the user speaks another language, reply in Portuguese.
5. **ALWAYS address the user as "Senhor"** in every interaction.

# STYLE EXAMPLE
User: "What time is it?"
MomAI: "São quatro e meia da tarde, Senhor."

User: "Can you search something for me?"
MomAI: "Claro, Senhor. O que gostaria que eu procurasse?"

Always answer in Portuguese (Brasil) and maintain a respectful, professional tone using "Senhor" consistently.
"""
chat_history: dict[str, list] = {}
MAX_MESSAGES = 20
llm_mode = "groq"
llm = None


def initialize_llm(mode: str):
    global llm, llm_mode
    print(f"[AI_core] Mudando modo para: {mode}")

    # Temporariamente desabilita o LLM anterior
    prev_llm = llm
    llm = None

    # Se não for modo local, garante que o servidor local esteja parado para economizar recurso
    if mode != "local":
        stop_server()

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
        print(
            f"[AI_core] Modelo {mode} pronto com {len(TOOLS)} ferramentas!")
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

        while True:
            full_response_message = None
            full_response_content = ""
            full_content = ""
            inside_think = False
            inside_tool_call = False

            # Buffer para acumular texto do TTS
            tts_buffer = ""

            # Padrão para detectar fim de sentença (Ponto, Exclamação, Interrogação) seguido de espaço ou fim de string
            import re
            sentence_end_pattern = re.compile(r'(.*?[.?!])(\s+|$)', re.DOTALL)

            # Streaming real usando astream
            async for chunk in llm.astream(messages):
                if full_response_message is None:
                    full_response_message = chunk
                else:
                    full_response_message += chunk

                if chunk.content:
                    full_response_content += chunk.content
                    content = chunk.content

                    # Filtro de pensamento e tools (mantido igual)
                    if "<think>" in content:
                        inside_think = True
                        content = content.split("<think>")[0]
                    if "</think>" in content:
                        inside_think = False
                        content = content.split("</think>")[-1]

                    if "<tool_call>" in content:
                        inside_tool_call = True
                        content = content.split("<tool_call>")[0]
                    if "</tool_call>" in content:
                        inside_tool_call = False
                        content = content.split("</tool_call>")[-1]

                    if not inside_think and not inside_tool_call and content:
                        # LangChain já entrega string decodificada, então o problema do UTF-8
                        # deve ser apenas caracteres de controle.
                        filtered_content = "".join(
                            c for c in content if ord(c) <= 0xFFFF)

                        if filtered_content:
                            full_content += filtered_content
                            yield f"data: {json.dumps({'token': filtered_content})}\n\n"

                            # Acumula no buffer do TTS
                            tts_buffer += filtered_content

                            # Tenta extrair frases completas do buffer
                            while True:
                                match = sentence_end_pattern.search(tts_buffer)
                                if match:
                                    # Encontrou uma frase completa
                                    sentence = match.group(1).strip()
                                    remaining = tts_buffer[match.end():]

                                    if sentence:
                                        # Envia apenas se for uma frase real (evita "..." solto)
                                        if len(sentence) > 2:
                                            # Limpa Markdown antes de falar
                                            clean_sentence = clean_text_for_tts(
                                                sentence)
                                            if clean_sentence.strip():
                                                tts_manager.speak_sentence(
                                                    clean_sentence)

                                    tts_buffer = remaining  # Mantém o resto no buffer
                                else:
                                    break  # Nenhuma frase completa encontrada, espera mais tokens

            # Envia resto do buffer de áudio se sobrou algo relevante
            if tts_buffer.strip():
                clean_phrase = clean_text_for_tts(
                    clean_response(tts_buffer)).strip()
                if len(clean_phrase) > 1:
                    tts_manager.speak_sentence(clean_phrase)

            # Verifica se há tool_calls após o stream terminar
            tool_calls = getattr(full_response_message, "tool_calls", [
            ]) if full_response_message else []

            # Fallback manual para modelos locais que cospem a tag <tool_call> como texto (ex: Qwen)
            if not tool_calls and llm_mode == "local":
                import re
                # Busca por tags <tool_call> ... </tool_call> no conteúdo BRUTO original
                match = re.search(
                    r'<tool_call>\s*(.*?)\s*</tool_call>', full_response_content, re.DOTALL)
                if match:
                    try:
                        tool_data = json.loads(match.group(1).strip())
                        # Normaliza os campos (alguns modelos usam 'arguments', outros 'args')
                        tool_args = tool_data.get(
                            "arguments") or tool_data.get("args") or {}

                        tool_calls = [{
                            "name": tool_data.get("name"),
                            "args": tool_args,
                            "id": f"call_{tool_data.get('name')}"
                        }]

                        # Fix: Recria a mensagem com as tools devidamente formatadas para o LangChain
                        full_response_message = AIMessage(
                            content=full_response_content,
                            tool_calls=tool_calls
                        )

                        print(
                            f"[AI_core] Tool call detectada manualmente no texto: {tool_calls}")
                    except Exception as e:
                        print(
                            f"[AI_core] Erro ao parsear tool call manual: {e}")

            if tool_calls and full_response_message:
                # Adiciona a resposta do AI com tool_calls ao histórico
                messages.append(full_response_message)

                for tool_call in tool_calls:
                    tool_name = tool_call["name"]
                    tool_args = tool_call.get("args", {})
                    tool_id = tool_call.get("id", tool_name)

                    print(
                        f"[AI_core] Executando tool: {tool_name} com args: {tool_args}")

                    if tool_name in AVAILABLE_TOOLS:
                        tool_result = AVAILABLE_TOOLS[tool_name].invoke(
                            tool_args)
                        messages.append(ToolMessage(
                            content=str(tool_result),
                            tool_call_id=tool_id
                        ))
                    else:
                        messages.append(ToolMessage(
                            content=f"Erro: Tool '{tool_name}' não encontrada.",
                            tool_call_id=tool_id
                        ))

                # Volta para o início do loop para gerar a resposta final com base no resultado da ferramenta
                continue
            else:
                # Salva a resposta final no histórico
                final_reply = clean_response(full_content)
                if message.thread_id in chat_history:
                    chat_history[message.thread_id].append(
                        AIMessage(content=final_reply))

                # Streaming TTS já cuidou da fala.

                yield f"data: {json.dumps({'done': True})}\n\n"
                break

    except Exception as e:
        print(f"Erro no stream: {e}")
        import traceback
        traceback.print_exc()
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
