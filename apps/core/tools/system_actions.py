from langchain_core.tools import tool
from pydantic import BaseModel, Field
import webbrowser
from langchain_community.tools import DuckDuckGoSearchRun
from typing import List, Literal, Dict, Any
import main
import asyncio

# Search instance
search = DuckDuckGoSearchRun()

# Global state
current_mode = "local"
version = "v0"

@tool
def open_browser(url: str):
    """Opens a URL in the default browser."""
    if not url.startswith("http"):
        url = "https://" + url
    webbrowser.open(url)
    return f"Opening browser at {url}"

@tool
def web_scrape(url: str):
    """Extracts text content from a web page."""
    import requests
    from bs4 import BeautifulSoup
    if not url.startswith("http"): url = "https://" + url
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        for s in soup(["script", "style"]): s.decompose()
        text = soup.get_text(separator='\n')
        return f"Content of {url}:\n\n{text[:5000]}..."
    except Exception as e:
        return f"Error reading site {url}: {str(e)}"

class ShowGraphInput(BaseModel):
    view: Literal['center', 'side'] = Field(description="'center' for dialogs/decisions. 'side' for info/status.")
    content: str = Field(description="Markdown content to display.")
    options: List[str] = Field(default=[], description="Action buttons for the user.")
    ui_schema: Dict[str, Any] = Field(default=None, description="Dynamic UI JSON schema.")
    bypass_wake_word: bool = Field(default=False, description="Whether to activate mic immediately.")

@tool(args_schema=ShowGraphInput)
def show_graph(view: Literal['center', 'side'], content: str, options: list[str] = None, ui_schema: dict = None, bypass_wake_word: bool = False):
    """Displays a graphical interface (UI) to the user."""
    if options is None: options = []
    main.set_graph_state(view, bypass_wake_word)
    payload = {
        "type": "graph_open",
        "data": {
            "view": view, "content": content, "options": options,
            "ui_schema": ui_schema, "bypass_wake_word": bypass_wake_word
        }
    }
    if main.main_loop:
        asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets(payload), main.main_loop)
    return f"Interface '{view}' opened."

@tool
def close_graph():
    """Closes any open UI."""
    main.set_graph_state(None, False)
    payload = {"type": "graph_close"}
    if main.main_loop:
        asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets(payload), main.main_loop)
    return "Interface closed."

@tool
def ask_confirmation(message: str, options: list[str] = None):
    """Shows a confirmation dialog in the Center UI."""
    if options is None: options = ["Yes", "No"]
    return show_graph.invoke({
        "view": "center", "content": f"### Confirmation Required\n\n{message}",
        "options": options, "bypass_wake_word": True
    })

@tool
def open_model_selector():
    """Opens the AI model selector."""
    return show_graph.invoke({
        "view": "center",
        "content": "### Select AI Model\n\nChoose the brain I should use.",
        "options": ["Local", "Groq", "Gemini"],
        "bypass_wake_word": True
    })

@tool
def switch_ai_model(mode: Literal['local', 'groq', 'gemini']):
    """Switches the current AI model provider."""
    import ai.orchestrator as orchestrator
    try:
        orchestrator.initialize_llm(mode)
        return f"OK: Switching to {mode}"
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

@tool
def launch_app(app_name_or_path: str):
    """
    Launches a Windows application, game, or opens a file/folder.
    Args:
        app_name_or_path: The name of the app (e.g., 'notepad', 'fortnite'), a path, or a URI.
    """
    import subprocess
    import os
    try:
        os.startfile(app_name_or_path)
        return f"Command sent to open: {app_name_or_path}"
    except Exception as e:
        try:
            subprocess.Popen(app_name_or_path, shell=True)
            return f"Trying to start {app_name_or_path} via shell."
        except Exception as e2:
            return f"Error trying to open {app_name_or_path}: {str(e2)}"

class CreateReminderInput(BaseModel):
    title: str = Field(description="Short title for the reminder.")
    content: str = Field(default=None, description="Optional extra detail.")
    scheduled_time: str = Field(description="Date and time in ISO format (YYYY-MM-DD HH:MM:SS)")
    repeat_interval: Literal['minutes', 'hours', 'days', 'weeks', 'months'] = Field(default=None, description="Interval for repetition.")
    repeat_value: int = Field(default=None, description="Value for interval (e.g., every 5 minutes).")

@tool(args_schema=CreateReminderInput)
def create_reminder_tool(title: str, scheduled_time: str, content: str = None, repeat_interval: str = None, repeat_value: int = None):
    """Schedules a new reminder or alarm."""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(scheduled_time)
        if not main.reminder_manager: return "Error: Reminder manager not ready."
        main.reminder_manager.add_reminder(title, content, dt, repeat_interval, repeat_value)
        return f"OK: Reminder '{title}' scheduled for {scheduled_time}."
    except Exception as e:
        return f"Error scheduling: {str(e)}"

@tool
def list_reminders_tool():
    """Lists all active reminders and their schedules."""
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
    if not main.reminder_manager: return "Error: Reminder manager not ready."
    main.reminder_manager.delete_reminder(reminder_id)
    return f"Reminder {reminder_id} deleted."

# Core Tools
search.name = "duckduckgo_search"
TOOLS = [
    open_browser, web_scrape, launch_app, search,
    show_graph, close_graph, ask_confirmation, open_model_selector, switch_ai_model,
    get_momai_resources_tool,
    create_reminder_tool, list_reminders_tool, delete_reminder_tool
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
