import re
import asyncio
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage, trim_messages
from local_model import load_model
import tools
from tools import TOOLS, AVAILABLE_TOOLS
import json
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
load_dotenv()

SYSTEM_PROMPT = """# PERSONA
You are MomAI, a virtual assistant created by Wesley. Your personality is helpful, straightforward, and maternal.

# CAPABILITIES (Orchestrator)
You coordinate agents to control Windows/Linux, automations, Notion, Obsidian, and web searches. If you can't do something directly, say you'll request it from the responsible agent.

# RESPONSE RULES (CRITICAL)
1. Respond as if you were SPEAKING: Short, natural, and without lists.
2. NEVER use cardinal or ordinal numerals. WRITE THEM OUT IN FULL.
   - Wrong: "It's 10 o'clock." -> Correct: "It's ten o'clock."
   - Wrong: "I did 1 task." -> Correct: "I did one task."
3. FORBIDDEN: Complex markdown, tables, excessive bold text, or code blocks (unless requested).

# STYLE EXAMPLE
User: "What time is it and how's my schedule?"
MomAI: "It's four thirty in the afternoon right now, Wesley. I checked here and you only have one appointment in Notion for today."

Always answer in Portuguese.
"""
chat_history: dict[str, list] = {}
MAX_MESSAGES = 5
llm_mode = "groq"
llm = None


def initialize_llm(mode: str):
    global llm, llm_mode
    print(f"[AI_core] Mudando modo para: {mode}")

    # Temporariamente desabilita o LLM anterior
    prev_llm = llm
    llm = None

    try:
        if mode == "local":
            print("[AI_core] Carregando modelo local...")
            new_llm = load_model(
                repo_id="Qwen/Qwen3-4B-GGUF",
                filename="Qwen3-4B-Q4_K_M.gguf"
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
    # Import adiado para garantir que tts_manager carregue HAS_TTS corretamente
    from tts_manager import speak
    if llm is None:
        yield f"data: {json.dumps({'error': 'Modelo ainda está sendo carregado. Por favor, aguarde...'})}\n\n"
        return

    try:
        messages = get_trimmed_messages(message.thread_id, message.content)

        while True:
            full_response_message = None
            full_response_content = ""  # Conteúdo bruto para parsing
            full_content = ""  # Conteúdo limpo para o usuário
            inside_think = False
            inside_tool_call = False

            # Streaming real usando astream
            async for chunk in llm.astream(messages):
                if full_response_message is None:
                    full_response_message = chunk
                else:
                    full_response_message += chunk

                if chunk.content:
                    # Acumula o conteúdo bruto original para o parsing de ferramentas no final
                    full_response_content += chunk.content
                    content = chunk.content

                    # Filtro básico para blocos de pensamento <think>
                    if "<think>" in content:
                        inside_think = True
                        content = content.split("<think>")[0]

                    if "</think>" in content:
                        inside_think = False
                        content = content.split("</think>")[-1]

                    # Filtro para chamadas de ferramentas <tool_call>
                    if "<tool_call>" in content:
                        inside_tool_call = True
                        content = content.split("<tool_call>")[0]

                    if "</tool_call>" in content:
                        inside_tool_call = False
                        content = content.split("</tool_call>")[-1]

                    if not inside_think and not inside_tool_call and content:
                        # Garante compatibilidade de caracteres (Windows)
                        filtered_content = "".join(
                            c for c in content if ord(c) <= 0xFFFF)
                        if filtered_content:
                            full_content += filtered_content
                            yield f"data: {json.dumps({'token': filtered_content})}\n\n"

            # Verifica se há tool_calls após o stream terminar
            tool_calls = getattr(full_response_message, "tool_calls", [])

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
                        print(
                            f"[AI_core] Tool call detectada manualmente no texto: {tool_calls}")
                    except Exception as e:
                        print(
                            f"[AI_core] Erro ao parsear tool call manual: {e}")

            if tool_calls:
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

                # Dispara o TTS em background
                print(
                    f"[AI_core] Chamando TTS para o texto: {final_reply[:50]}...")
                asyncio.create_task(speak(final_reply))

                yield f"data: {json.dumps({'done': True})}\n\n"
                break

    except Exception as e:
        print(f"Erro no stream: {e}")
        import traceback
        traceback.print_exc()
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
