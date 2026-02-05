from langchain_core.tools import tool
from pydantic import BaseModel, Field
import webbrowser
from langchain_community.tools import DuckDuckGoSearchRun
from typing import List, Literal, Dict, Any

import asyncio

# Search instance
search = DuckDuckGoSearchRun()

# Global state
current_mode = "local"
version = "v0"



class ShowInterfaceInput(BaseModel):
    view: Literal['side'] = Field(default='side', description="The view type. Currently only 'side' is supported.")
    content: str = Field(description="Markdown content to display.")
    options: List[str] = Field(default=[], description="Action buttons for the user.")
    ui_schema: Dict[str, Any] = Field(default=None, description="Dynamic UI JSON schema.")
    bypass_wake_word: bool = Field(default=False, description="Whether to activate mic immediately.")

@tool(args_schema=ShowInterfaceInput)
def show_interface(content: str, view: Literal['side'] = 'side', options: list[str] = None, ui_schema: dict = None, bypass_wake_word: bool = False):
    """
    Displays a graphical side interface (UI) to the user.
    MANDATORY Usage: Use this whenever the user asks to "show", "list", or "open interface", OR when displaying lists, markdown tables, or long content.
    """
    if options is None: options = []
    # Force view to be 'side' just in case
    view = 'side'
    import main
    main.set_graph_state(view, bypass_wake_word)
    
    graph_data = {
        "view": view, "content": content, "options": options,
        "ui_schema": ui_schema, "bypass_wake_word": bypass_wake_word
    }
    
    # Register for persistence (will be saved with the message)
    # Get thread_id from current context if available, otherwise use default
    import threading
    thread_id = getattr(threading.current_thread(), '_momai_thread_id', 'default')
    main.set_pending_graph_data(thread_id, graph_data)
    
    payload = {"type": "graph_open", "data": graph_data}
    if main.main_loop:
        asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets(payload), main.main_loop)
    return f"Interface '{view}' opened."

@tool
def close_interface():
    """Closes any open UI."""
    import main
    main.set_graph_state(None, False)
    payload = {"type": "graph_close"}
    if main.main_loop:
        asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets(payload), main.main_loop)
    return "Interface closed."

@tool
def ask_confirmation(message: str, options: list[str] = None):
    """Shows a confirmation dialog in the UI."""
    if options is None: options = ["Yes", "No"]
    return show_interface.invoke({
        "view": "side", "content": f"### Confirmation Required\n\n{message}",
        "options": options, "bypass_wake_word": True
    })

@tool
def open_model_selector():
    """Opens the AI model selector."""
    return show_interface.invoke({
        "view": "side",
        "content": "### Modelo Local\n\nNo momento o MomAI opera exclusivamente de forma local e privada.",
        "options": ["Local"],
        "bypass_wake_word": True
    })

@tool
def switch_ai_model(mode: Literal['local']):
    """Switches the current AI model provider. Only 'local' is supported."""
    import ai.orchestrator as orchestrator
    try:
        orchestrator.initialize_llm("local")
        return f"OK: Switching to local"
    except Exception as e:
        return f"Error: {str(e)}"

# System Resource Helper (needed for core)
def get_momai_resources():
    import psutil, os, platform, subprocess
    try:
        current_pid = os.getpid()
        total_ram = 0
        total_cpu = 0
        for p in psutil.process_iter(['pid', 'name']):
            try:
                if any(x in p.info['name'].lower() for x in ["momai", "electron", "llama-server", "python"]):
                    total_ram += p.memory_info().rss
                    total_cpu += p.cpu_percent()
            except: continue
        return {"ram_mb": round(total_ram/1024**2, 1), "cpu_percent": round(total_cpu, 1), "vram_used_mb": 0, "vram_total_mb": 0}
    except: return {"ram_mb": 0, "cpu_percent": 0, "vram_used_mb": 0, "vram_total_mb": 0}

@tool
def get_momai_resources_tool():
    """Displays resource consumption."""
    data = get_momai_resources()
    return f"### MomAI Status\n\n- **RAM:** {data['ram_mb']} MB\n- **CPU:** {data['cpu_percent']}%"



class CreateReminderInput(BaseModel):
    title: str = Field(description="Short title for the reminder.")
    content: str = Field(default=None, description="Optional extra detail.")
    scheduled_time: str = Field(description="Date and time for the FIRST trigger in ISO format (YYYY-MM-DD HH:MM:SS). For recurring reminders, set this to NOW or NOW + interval.")
    repeat_interval: Literal['minutes', 'hours', 'days', 'weeks', 'months'] = Field(default=None, description="Interval unit for repetition (e.g., 'minutes' for every N minutes).")
    repeat_value: int = Field(default=None, description="Value for interval (e.g., 25 for 'every 25 minutes').")

@tool(args_schema=CreateReminderInput)
def create_reminder_tool(title: str, scheduled_time: str, content: str = None, repeat_interval: str = None, repeat_value: int = None):
    """Schedules a new reminder or alarm. For RECURRING reminders, set scheduled_time to NOW (or NOW + interval) and provide repeat_interval + repeat_value."""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(scheduled_time)
        import main
        if not main.reminder_manager: return "Error: Reminder manager not ready."
        main.reminder_manager.add_reminder(title, content, dt, repeat_interval, repeat_value)
        return f"OK: Reminder '{title}' scheduled for {scheduled_time}."
    except Exception as e:
        return f"Error scheduling: {str(e)}"

@tool
def list_reminders_tool():
    """Lists all active reminders and their schedules."""
    import main
    if not main.reminder_manager:
        return "Reminder system not initialized."
    reminders = main.reminder_manager.list_reminders()
    if not reminders:
        return "You have no active reminders."
    
    res = "### Current Reminders:\n\n"
    for r in reminders:
        status = "Active" if r.is_active else "Off"
        res += f"- **ID {r.id}:** {r.title} (Scheduled: {r.scheduled_time}) - Status: {status}\n"
    return res

@tool
def delete_reminder_tool(reminder_id: int):
    """Deletes a reminder by its ID."""
    import main
    if not main.reminder_manager: return "Error: Reminder manager not ready."
    main.reminder_manager.delete_reminder(reminder_id)
    return f"Reminder {reminder_id} deleted."

@tool
def get_capabilities():
    """Retrieves a raw list of all available system tools and extensions and OPENS the side interface to display them."""
    from services.extensions.manager import extension_manager
    import main
    import asyncio
    
    # 1. Native Tools
    report = "### TODAS AS CAPACIDADES DO SISTEMA\n"
    report += "Abaixo está a lista completa de ferramentas e extensões disponíveis no sistema:\n\n"
    report += "**Ferramentas Nativas do Sistema:**\n"
    for t in TOOLS:
        if t.name == "get_capabilities": continue
        # Simple extraction of first line of docstring
        desc = t.description.split('\n')[0] if t.description else "Sem descrição"
        report += f"- `{t.name}`: {desc}\n"

    # 2. Extensions
    ext_tools = extension_manager.get_tools()
    if ext_tools:
        report += "\n**Extensões:**\n"
        for t in ext_tools:
             desc = t.description.split('\n')[0] if t.description else "Sem descrição"
             report += f"- `{t.name}`: {desc}\n"
    else:
        report += "\n**Extensões:** Nenhuma instalada.\n"
    
    # Force open interface directly from here
    main.set_graph_state('side', False)
    payload = {
        "type": "graph_open",
        "data": {
            "view": "side", 
            "content": report, 
            "options": [],
            "ui_schema": None, 
            "bypass_wake_word": False
        }
    }
    if main.main_loop:
        asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets(payload), main.main_loop)
        
    return "SUCESSO: A lista de capacidades foi enviada para a interface do usuário."

# Core Tools
search.name = "duckduckgo_search"
TOOLS = [
    search,
    show_interface, close_interface, ask_confirmation, open_model_selector, switch_ai_model,
    get_momai_resources_tool,
    create_reminder_tool, list_reminders_tool, delete_reminder_tool,
    get_capabilities
]

AVAILABLE_TOOLS = {t.name: t for t in TOOLS}

def get_all_tools_registry():
    """Returns a unified dictionary of all tools (native + extensions)."""
    from services.extensions.manager import extension_manager
    registry = AVAILABLE_TOOLS.copy()
    
    ext_tools = extension_manager.get_tools()
    for t in ext_tools:
        registry[t.name] = t
        
    return registry

def get_all_tools_list():
    """Returns a list of all tools (native + extensions)."""
    return list(get_all_tools_registry().values())
