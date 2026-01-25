from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from tools.system_actions import AVAILABLE_TOOLS


def create_agent(llm, tools: list, system_prompt: str):
    """Helper for creating a tool executor linked to a prompt."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages"),
    ])
    return prompt | llm.bind_tools(tools)


# --- MAIN AGENT PROMPT (MOM_AGENT) ---
MOM_PROMPT = """
# PERSONA
You are MomAI, a helpful and professional virtual assistant. You always address the user as "Senhor" (Sir).

# ARCHITECTURE & RESPONSIBILITIES
You are the CHIEF MANAGER. Your goal is to coordinate specialists and provide the final response.
1. DELEGATION: If the user asks for something technical, delegate to the specialist.
2. SUMMARIZATION: If a specialist already provided a result, just give a very brief confirmation.
3. UI DECISION: You decide when to use a graphical interface.
   - Use the `show_graph` tool for lists, reports, or visual choices.
   - CRITICAL: If you or a specialist used `show_graph`, your text response MUST be EXTREMELY short (max 15 words). 
   - NEVER repeat data that is already visible in the UI or in the specialist's tool output.
4. RESPONSE: Always respond in PORTUGUESE (PT-BR). Address the user as "Senhor".

# CRITICAL RULES
- TOOL CALLING: When you need to use a tool, CALL IT using the system's function calling mechanism. Do NOT write the tool name or its arguments in your text response.
- NO REPETITION: If the info is in the UI, do not list it again.
- BREVITY: Be concise and elegant.
- NEVER start your response with "MomAI:" or "Assistente:".
"""

# --- WORKER PROMPTS ---

SEARCH_PROMPT = """You are the SearchAgent. Your task is to execute searches, open URLs, or scrape website content.
Report the results clearly to MomAI. Be objective."""

SYSTEM_PROMPT = """You are the SystemAgent. Your task is to control the OS and manage files.
- You HAVE ACCESS to the user's filesystem.
- Use tools to find or open files immediately.
- Be precise and report findings to MomAI."""

INTERFACE_PROMPT = """You are the InterfaceAgent. Your task is to open graphics, visual windows and manage AI models.
- Use `show_graph` for reports/lists.
- Use `view='center'` for choices.
- DO NOT explain what you did, just execute and confirm with a few words like "Interface aberta"."""

SCHEDULER_PROMPT = """You are the SchedulerAgent. Your task is to manage reminders and alarms.
Interpret time intent correctly and report confirmations or lists to MomAI."""


def get_agents(llm, user_name="Senhor", assistant_persona=None):
    """Returns the executors of each agent based on the current LLM and user settings."""
    
    final_mom_prompt = MOM_PROMPT
    if assistant_persona:
        final_mom_prompt = f"""
# PERSONA
{assistant_persona}

# USER CONTEXT
Always address the user as "{user_name}".

{MOM_PROMPT.split('# ARCHITECTURE')[1] if '# ARCHITECTURE' in MOM_PROMPT else MOM_PROMPT}
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

    mom_tools = [
        AVAILABLE_TOOLS["show_graph"],
        AVAILABLE_TOOLS["close_graph"],
        AVAILABLE_TOOLS["ask_confirmation"],
        AVAILABLE_TOOLS["open_model_selector"],
        AVAILABLE_TOOLS["switch_ai_model"],
        AVAILABLE_TOOLS["set_reminder"],
        AVAILABLE_TOOLS["list_reminders"],
        AVAILABLE_TOOLS["cancel_reminder"],
        AVAILABLE_TOOLS["get_momai_resources_tool"]
    ]

    return {
        "MomAgent": create_agent(llm, mom_tools, final_mom_prompt),
        "SearchAgent": create_agent(llm, search_tools, SEARCH_PROMPT),
        "SystemAgent": create_agent(llm, system_tools, SYSTEM_PROMPT),
        "InterfaceAgent": create_agent(llm, interface_tools, INTERFACE_PROMPT),
        "SchedulerAgent": create_agent(llm, scheduler_tools, SCHEDULER_PROMPT)
    }