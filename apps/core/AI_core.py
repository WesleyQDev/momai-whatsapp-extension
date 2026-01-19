import re
import asyncio
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage, trim_messages
from local_model import load_model, AVAILABLE_TOOLS
import json
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
load_dotenv()

SYSTEM_PROMPT = """Voce é MomAI, uma assistente virtual criada por Wesley. Diferente de assistentes comuns, o usuario terá controle total sobre quais funcionalidades instalar e onde seus dados são armazenados. Você pode controlar o Sistema Operacional e ajudar na produtividade.
Responda sempre com mensagens curtas, lembrese vc fala, então não retorne valores estranhos
"""
chat_history: dict[str, list] = {}
MAX_MESSAGES = 5
llm_mode = "local"
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
        else:  # genai
            print("[AI_core] Carregando modelo GenAI...")
            new_llm = init_chat_model("google_genai:gemini-2.5-flash-lite")

        llm = new_llm
        llm_mode = mode
        print(f"[AI_core] Modelo {mode} pronto!")
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
        full_response = ""
        inside_think = False
        first_token = True

        # Primeira chamada ao modelo (pode retornar tool_calls)
        response = llm.invoke(messages)  # type: ignore
        
        # Parse manual de tool_calls no conteúdo (para modelos que retornam XML/Texto)
        if hasattr(response, 'content') and isinstance(response.content, str):
            tool_call_regex = r'<tool_call>(.*?)</tool_call>'
            match = re.search(tool_call_regex, response.content, re.DOTALL)
            if match:
                try:
                    tool_json_str = match.group(1).strip()
                    tool_data = json.loads(tool_json_str)
                    
                    print(f"[AI_core] Tool call detectado no texto: {tool_data}")

                    if not hasattr(response, 'tool_calls'):
                        response.tool_calls = []
                    
                    # Garante formato correto
                    args = tool_data.get("arguments", {})
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except:
                            pass

                    response.tool_calls.append({
                        "name": tool_data.get("name"),
                        "args": args,
                        "id": tool_data.get("id", f"call_{tool_data.get('name')}")
                    })
                    
                    # Limpa o content para não mostrar o XML para o usuário
                    response.content = response.content.replace(match.group(0), "").strip()
                except Exception as e:
                    print(f"[AI_core] Erro ao parsear tool_call manual: {e}")

        # Verifica se há tool_calls na resposta
        if hasattr(response, 'tool_calls') and response.tool_calls:
            # Adiciona a resposta do AI com tool_calls ao histórico
            messages.append(response)
            
            # Executa cada tool call
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call.get("args", {})
                tool_id = tool_call.get("id", tool_name)
                
                print(f"[AI_core] Executando tool: {tool_name} com args: {tool_args}")
                
                if tool_name in AVAILABLE_TOOLS:
                    # Executa a tool
                    tool_result = AVAILABLE_TOOLS[tool_name].invoke(tool_args)
                    print(f"[AI_core] Resultado da tool: {tool_result}")
                    
                    # Adiciona o resultado como ToolMessage
                    messages.append(ToolMessage(
                        content=str(tool_result),
                        tool_call_id=tool_id
                    ))
                else:
                    messages.append(ToolMessage(
                        content=f"Tool '{tool_name}' não encontrada.",
                        tool_call_id=tool_id
                    ))
            
            # Chama o modelo novamente com o resultado da tool
            response = llm.invoke(messages)  # type: ignore
        
        # Processa a resposta final (streaming para o usuário)
        if hasattr(response, 'content') and response.content:
            raw_content = response.content
            # Limpa o conteúdo
            cleaned = clean_response(raw_content)
            for token in cleaned:
                full_response += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        
        # Limpa e salva resposta final
        final_reply = clean_response(full_response)
        if message.thread_id in chat_history:
            chat_history[message.thread_id].append(
                AIMessage(content=final_reply))

        # Dispara o TTS em background para não travar o evento final
        print(f"[AI_core] Chamando TTS para o texto: {final_reply[:50]}...")
        asyncio.create_task(speak(final_reply))

        yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as e:
        print(f"Erro no stream: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
