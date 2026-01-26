from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from tools.system_actions import AVAILABLE_TOOLS


def create_agent(llm, tools: list, system_prompt: str):
    """Helper for creating a tool executor linked to a prompt."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm.bind_tools(tools)


# --- RESPONDER AGENT PROMPT ---
RESPONDER_PROMPT = """
# PERSONA
You are MomAI, a helpful and professional virtual assistant. You always address the user as "Senhor" (Sir).

# RESPONSIBILITIES
You are the final voice of the system. Your goal is to provide a friendly and polite response.
1. SUMMARIZATION: If a specialist already provided a result (look at the conversation history), summarize it elegantly.
2. CONVERSATION: If it's just a greeting or general chat, respond naturally.
3. UI CONTEXT: If a graphical interface was opened (check tool calls in history), keep your response EXTREMELY brief (max 15 words).
4. NO INVENTING: If the history doesn't contain the answer to a technical question, do NOT invent. Admit you couldn't get the info.

# RULES
- LANGUAGE: Always respond in PORTUGUESE (PT-BR).
- ADDRESS: Always use "Senhor".
- BREVITY: Be concise.
"""

# --- SPECIALIST PROMPTS ---

SEARCH_PROMPT = """You are the SearchAgent. Your task is to execute web searches, open URLs, or scrape content.
Use tools for news, weather, or facts not in your knowledge base.
Report results clearly so MomAI can summarize them."""

SYSTEM_PROMPT = """You are the SystemAgent. Your task is to control the Windows OS, manage files, and report system status.
- You HAVE ACCESS to tools for: Current Time/Date, System Stats (CPU/RAM), Filesystem Search, Window Management, and Process Control.
- Use the appropriate tool immediately for any system-related request.
- Be precise and objective."""

INTERFACE_PROMPT = """You are the InterfaceAgent. Your task is to open graphical interfaces (UI), dialogs, and manage AI models.
- Use `show_graph` for reports/lists.
- Use `view='center'` for choices or confirmations.
- Just execute and confirm briefly."""

SCHEDULER_PROMPT = """You are the SchedulerAgent. Your task is to manage reminders and tasks.
Interpret time intent (e.g., 'in 5 minutes', 'tomorrow at 10am') and use scheduling tools.
Report confirmation of the scheduled event."""


def get_agents(llm, user_name="Senhor", assistant_persona=None):
    """Returns the executors of each agent based on the current LLM and user settings."""
    
    final_mom_prompt = RESPONDER_PROMPT
    if assistant_persona:
        final_mom_prompt = f"""
# PERSONA
{assistant_persona}

# USER CONTEXT
Always address the user as "{user_name}".

{RESPONDER_PROMPT.split('# RESPONSIBILITIES')[1] if '# RESPONSIBILITIES' in RESPONDER_PROMPT else RESPONDER_PROMPT}
"""

    search_tools = [AVAILABLE_TOOLS["open_browser"], AVAILABLE_TOOLS["web_scrape"]]
    from tools.system_actions import search as ddg_search
    search_tools.append(ddg_search)

    system_tools = [
        AVAILABLE_TOOLS["get_current_time"],
        AVAILABLE_TOOLS["get_system_stats"],
        AVAILABLE_TOOLS["system_control"],
        AVAILABLE_TOOLS["search_filesystem"],
        AVAILABLE_TOOLS["jump_to_folder"],
        AVAILABLE_TOOLS["manage_process"],
        AVAILABLE_TOOLS["open_program"],
        AVAILABLE_TOOLS["open_file"],
        AVAILABLE_TOOLS["manage_window"],
        AVAILABLE_TOOLS["get_momai_resources_tool"]
    ]

    interface_tools = [
        AVAILABLE_TOOLS["show_graph"],
        AVAILABLE_TOOLS["close_graph"],
        AVAILABLE_TOOLS["ask_confirmation"],
        AVAILABLE_TOOLS["open_model_selector"],
        AVAILABLE_TOOLS["switch_ai_model"]
    ]

    scheduler_tools = [
        AVAILABLE_TOOLS["set_reminder"],
        AVAILABLE_TOOLS["list_reminders"],
        AVAILABLE_TOOLS["cancel_reminder"]
    ]

    # MomAgent (Responder) only needs UI/General tools for its own interaction
    mom_tools = [
        AVAILABLE_TOOLS["show_graph"],
        AVAILABLE_TOOLS["close_graph"],
        AVAILABLE_TOOLS["ask_confirmation"],
        AVAILABLE_TOOLS["open_model_selector"],
        AVAILABLE_TOOLS["switch_ai_model"],
        AVAILABLE_TOOLS["get_momai_resources_tool"]
    ]

    return {
        "MomAgent": create_agent(llm, mom_tools, final_mom_prompt),
        "SearchAgent": create_agent(llm, search_tools, SEARCH_PROMPT),
        "SystemAgent": create_agent(llm, system_tools, SYSTEM_PROMPT),
        "InterfaceAgent": create_agent(llm, interface_tools, INTERFACE_PROMPT),
        "SchedulerAgent": create_agent(llm, scheduler_tools, SCHEDULER_PROMPT)
    }
