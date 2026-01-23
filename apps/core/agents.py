from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from tools import AVAILABLE_TOOLS


def create_agent(llm, tools: list, system_prompt: str):
    """Helper for creating a tool executor linked to a prompt."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm.bind_tools(tools)


# --- PROMPT DO AGENTE PRINCIPAL (MOM_AGENT) ---
MOM_PROMPT = """
# PERSONA
You are MomAI, a helpful and professional virtual assistant. You always address the user as "Sir".

# ARQUITETURA
Você é a GERENTE PRINCIPAL. Sua função é:
1. Se for uma conversa simples, responda diretamente.
2. Se precisar de uma confirmação, use `ask_confirmation`.
3. Se o usuário pedir para mudar o modelo e disser qual (Local, Groq, Gemini), use `switch_ai_model` DIRETAMENTE. Se não especificar, use `open_model_selector`.
4. Se a resposta for LONGA ou TÉCNICA (ex: códigos, logs, explicações detalhadas): Dê um resumo curto no chat e use `show_graph(view='side', content=DETALHES)` para mostrar tudo.
5. Se for uma tarefa técnica (arquivos, sistema, busca), delegue para o especialista correto.

# SPECIALISTS
- SearchAgent: Web search and opens websites.
- SystemAgent: Volume control, processes, files, and windows.
- InterfaceAgent: Visual commands and graphical interface.

# RESPONSE RULES
- ALWAYS respond in PORTUGUESE (PT-BR).
- ALWAYS address the user as "Sir" ("Senhor").
- Respond in a natural and brief manner.
"""

# --- PROMPTS DOS SUB-AGENTES (WORKERS) ---

SEARCH_PROMPT = """You are the SearchAgent. Your task is to execute searches or open URLs.
After using the tool, report the technical results to MomAI."""

SYSTEM_PROMPT = """You are the SystemAgent. Your task is to manage files, control Windows and processes.
Report the success or error of the action in a clear and technical manner."""

INTERFACE_PROMPT = """You are the InterfaceAgent. Your task is to open graphics and visual windows.
Execute the requested action and confirm to MomAI."""


def get_agents(llm):
    """Returns the executors of each agent based on the current LLM."""
    # Ferramentas de Busca
    search_tools = [AVAILABLE_TOOLS["open_browser"]]
    from tools import search as ddg_search
    search_tools.append(ddg_search)

    # Ferramentas de Sistema
    system_tools = [
        AVAILABLE_TOOLS["get_current_time"],
        AVAILABLE_TOOLS["get_system_stats"],
        AVAILABLE_TOOLS["system_control"],
        AVAILABLE_TOOLS["search_filesystem"],
        AVAILABLE_TOOLS["manage_process"],
        AVAILABLE_TOOLS["open_program"],
        AVAILABLE_TOOLS["open_file"],
        AVAILABLE_TOOLS["manage_window"]
    ]

    # Ferramentas de Interface
    interface_tools = [
        AVAILABLE_TOOLS["show_graph"],
        AVAILABLE_TOOLS["close_graph"],
        AVAILABLE_TOOLS["ask_confirmation"],
        AVAILABLE_TOOLS["open_model_selector"],
        AVAILABLE_TOOLS["switch_ai_model"]
    ]

    # Ferramentas da Gerente (MomAgent)
    mom_tools = [
        AVAILABLE_TOOLS["ask_confirmation"],
        AVAILABLE_TOOLS["open_model_selector"],
        AVAILABLE_TOOLS["switch_ai_model"]
    ]

    return {
        "MomAgent": create_agent(llm, mom_tools, MOM_PROMPT),
        "SearchAgent": create_agent(llm, search_tools, SEARCH_PROMPT),
        "SystemAgent": create_agent(llm, system_tools, SYSTEM_PROMPT),
        "InterfaceAgent": create_agent(llm, interface_tools, INTERFACE_PROMPT)
    }
