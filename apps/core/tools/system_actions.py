from langchain_core.tools import tool
from pydantic import BaseModel, Field
from datetime import datetime
import platform
import os
import subprocess
import webbrowser
import psutil
from langchain_community.tools import DuckDuckGoSearchRun
from typing import List, Literal, Dict, Any
import pygetwindow as gw
from pathlib import Path

# Search instance
search = DuckDuckGoSearchRun()

# Global state
current_mode = "local"
version = "0.5.4"

# Windows Folder Aliases
FOLDER_ALIASES = {
    "docs": "Documents",
    "documents": "Documents",
    "pics": "Pictures",
    "pictures": "Pictures",
    "images": "Pictures",
    "vids": "Videos",
    "videos": "Videos",
    "music": "Music",
    "desktop": "Desktop",
    "downloads": "Downloads",
    "dev": "Desktop",
}


@tool
def get_current_time():
    """
    Returns current time in HH:MM format.

    Returns:
        str: Current time.
    """
    return datetime.now().strftime("%H:%M")


@tool
def get_system_stats():
    """
    Returns vital system statistics focused on Windows performance.

    Returns:
        dict: A summary text and a detailed markdown report.
    """
    cpu_usage = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    battery = psutil.sensors_battery()

    status = f"**CPU:** {cpu_usage}% | **RAM:** {mem.percent}%\n\n(`{round(mem.used/1024**3, 1)}GB` used of `{round(mem.total/1024**3, 1)}GB`)"
    if battery:
        status += f"\n\n**Battery:** {battery.percent}% ({'Charging ⚡' if battery.power_plugged else 'Discharging'})"

    return {
        "text_summary": f"CPU {cpu_usage}%, RAM {mem.percent}%",
        "markdown_report": f"# System Status\n\n{status}"
    }


class SystemControlInput(BaseModel):
    command: Literal['volume_up', 'volume_down', 'mute', 'lock_screen', 'sleep', 'shutdown', 'restart'] = Field(description="The system command to execute.")

@tool(args_schema=SystemControlInput)
def system_control(command: Literal['volume_up', 'volume_down', 'mute', 'lock_screen', 'sleep', 'shutdown', 'restart']):
    """
    Executes Windows OS control commands (Volume, Screen Lock, Power).

    Args:
        command (str): The command to execute.

    Returns:
        str: Success or error message.
    """
    try:
        if command == "volume_up":
            script = '(New-Object -ComObject WScript.Shell).SendKeys([char]175)'
            subprocess.run(["powershell", "-c", script], shell=True)
            return "Volume increased."
        elif command == "volume_down":
            script = '(New-Object -ComObject WScript.Shell).SendKeys([char]174)'
            subprocess.run(["powershell", "-c", script], shell=True)
            return "Volume decreased."
        elif command == "mute":
            script = '(New-Object -ComObject WScript.Shell).SendKeys([char]173)'
            subprocess.run(["powershell", "-c", script], shell=True)
            return "Audio toggled."
        elif command == "lock_screen":
            subprocess.run("rundll32.exe user32.dll,LockWorkStation", shell=True)
            return "Windows locked."
        elif command == "sleep":
            subprocess.run("powershell -command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)\"", shell=True)
            return "System going to sleep."
        elif command == "shutdown":
            subprocess.run("shutdown /s /t 60", shell=True)
            return "System will shutdown in 60 seconds. Use 'shutdown /a' to cancel."
        elif command == "restart":
            subprocess.run("shutdown /r /t 60", shell=True)
            return "System will restart in 60 seconds. Use 'shutdown /a' to cancel."
    except Exception as e:
        return f"Error controlling system: {str(e)}"


class SearchFilesystemInput(BaseModel):
    query: str = Field(description="Search pattern (e.g., 'resume', 'report', 'photos').")
    search_type: Literal['file', 'folder', 'both'] = Field(default='both', description="Filter by 'file', 'folder' or 'both'.")
    location_alias: str = Field(default="common", description="Search location: 'docs', 'desktop', 'downloads', 'common' (all 3), 'home' (user profile) or 'all' (all drives).")

@tool(args_schema=SearchFilesystemInput)
def search_filesystem(query: str, search_type: Literal['file', 'folder', 'both'] = 'both', location_alias: str = "common") -> str:
    """
    Locates files or folders on the user's PC using smart search.
    
    Useful for finding documents, images or user files.

    Args:
        query (str): Search pattern.
        search_type (str): 'file', 'folder', or 'both'.
        location_alias (str): Location alias.

    Returns:
        str: Formatted search results.
    """
    user_home = Path.home()

    def _resolve_win_path(folder_name: str) -> Path:
        onedrive = user_home / "OneDrive" / folder_name
        if onedrive.exists():
            return onedrive
        return user_home / folder_name

    search_roots = []
    alias = location_alias.lower().strip()

    if alias == "common":
        search_roots = [_resolve_win_path("Desktop"), _resolve_win_path("Documents"), _resolve_win_path("Downloads")]
    elif alias == "home":
        search_roots = [user_home]
    elif alias == "all":
        for drive in psutil.disk_partitions():
            if 'fixed' in drive.opts or drive.fstype != '':
                search_roots.append(Path(drive.mountpoint))
    elif alias in FOLDER_ALIASES:
        search_roots = [_resolve_win_path(FOLDER_ALIASES[alias])]
    else:
        search_roots = [_resolve_win_path("Documents"), _resolve_win_path("Desktop")]

    results = []
    limit = 40
    ignore = {'.git', 'node_modules', '__pycache__', 'AppData', '$RECYCLE.BIN', 'System Volume Information', 'Library', 'Local'}

    query_clean = query.replace("*", "").strip()
    if not query_clean:
        return "Error: Invalid search query."

    for root in search_roots:
        if not root.exists(): continue
        try:
            for p in root.rglob(f"*{query_clean}*"):
                if any(ignored in p.parts for ignored in ignore): continue
                
                is_dir = p.is_dir()
                if search_type == 'file' and is_dir: continue
                if search_type == 'folder' and not is_dir: continue

                results.append(p)
                if len(results) >= limit: break
            if len(results) >= limit: break
        except Exception:
            continue

    if not results:
        return f"No items found matching '{query_clean}' in {location_alias}."

    formatted = []
    for p in results:
        icon = "📁" if p.is_dir() else "📄"
        try:
            display_path = str(p.relative_to(user_home))
            display_path = f"~/{display_path}"
        except:
            display_path = str(p)
        formatted.append(f"{icon} {p.name} ({display_path})")

    return "SEARCH_RESULTS:\n" + "\n".join(formatted)


@tool
def open_browser(url: str):
    """
    Opens a URL in the default browser.

    Args:
        url (str): The URL to open.

    Returns:
        str: Confirmation message.
    """
    if not url.startswith("http"):
        url = "https://" + url
    webbrowser.open(url)
    return f"Opening browser at {url}"


@tool
def web_scrape(url: str):
    """
    Extracts text content from a web page.
    
    Use when details from a specific site or article are needed.

    Args:
        url (str): The URL to scrape.

    Returns:
        str: Scraped text or error message.
    """
    import requests
    from bs4 import BeautifulSoup

    if not url.startswith("http"):
        url = "https://" + url

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        for script_or_style in soup(["script", "style", "nav", "footer", "header", "aside"]):
            script_or_style.decompose()

        text = soup.get_text(separator='\n')
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return f"Content of {url}:\n\n{text[:5000]}..."
    except Exception as e:
        return f"Error reading site {url}: {str(e)}"


@tool
def manage_process(process_name: str, action: Literal['check', 'kill'] = 'check'):
    """
    Manages Windows processes by name.

    Args:
        process_name (str): Name of the process.
        action (str): 'check' or 'kill'. Defaults to 'check'.

    Returns:
        str: Summary of the action.
    """
    count = 0
    for proc in psutil.process_iter(['name']):
        if process_name.lower() in proc.info['name'].lower():
            if action == 'kill':
                proc.kill()
            count += 1

    verb = "Terminated" if action == 'kill' else "Found"
    return f"{verb} {count} instances of {process_name}."


@tool
def open_program(name: str):
    """
    Opens a Windows program by name or URI.

    Args:
        name (str): Program name or alias.

    Returns:
        str: Success or error message.
    """
    name = name.lower().strip()
    shortcuts = {
        "fortnite": "com.epicgames.launcher://apps/fortnite?action=launch&silent=true",
        "steam": "steam://open/main",
        "browser": "https://google.com",
        "notepad": "notepad.exe",
        "calc": "calc.exe"
    }
    target = shortcuts.get(name, name)
    try:
        os.startfile(target)
        return f"Launched {name}."
    except Exception as e:
        return f"Failed to launch {name}: {str(e)}"


@tool
def open_file(file_path: str):
    """
    Opens a file using the default Windows application.

    Args:
        file_path (str): Path or name of the file.

    Returns:
        str: Success or error message.
    """
    path_obj = Path(file_path)
    user_home = Path.home()

    if path_obj.exists():
        try:
            os.startfile(path_obj.resolve())
            return f"Opening '{path_obj.name}'..."
        except Exception as e:
            return f"Error opening file: {e}"

    candidates = [
        user_home / "OneDrive" / "Documents" / file_path,
        user_home / "OneDrive" / "Desktop" / file_path,
        user_home / "Downloads" / file_path,
        user_home / "Documents" / file_path,
        user_home / "Desktop" / file_path
    ]

    for cand in candidates:
        if cand.exists():
            try:
                os.startfile(cand)
                return f"Found and opening '{cand.name}'."
            except Exception as e:
                return f"Error: {e}"

    # Recursive search as fallback
    search_roots = [user_home / "OneDrive" / "Documents", user_home / "Documents", user_home / "Desktop"]
    for root in search_roots:
        if not root.exists(): continue
        try:
            matches = root.rglob(path_obj.name)
            first_match = next(matches, None)
            if first_match:
                os.startfile(first_match)
                return f"Located and opening '{first_match.name}'."
        except Exception: continue

    return f"File '{file_path}' not found."


@tool
def manage_window(title: str, action: Literal['focus', 'close', 'minimize', 'maximize']):
    """
    Controls application windows.

    Args:
        title (str): Window title.
        action (str): 'focus', 'close', 'minimize', or 'maximize'.

    Returns:
        str: Success or error message.
    """
    windows = gw.getWindowsWithTitle(title)
    if not windows:
        return f"No window found with title '{title}'"

    win = windows[0]
    try:
        if action == 'focus': win.activate()
        elif action == 'close': win.close()
        elif action == 'minimize': win.minimize()
        elif action == 'maximize': win.maximize()
        return f"Executed {action} on '{win.title}'"
    except Exception as e:
        return f"Window error: {str(e)}"


class ShowGraphInput(BaseModel):
    view: Literal['center', 'side'] = Field(description="'center' for dialogs/decisions. 'side' for info/status.")
    content: str = Field(description="Markdown content to display.")
    options: List[str] = Field(default=[], description="Action buttons for the user.")
    ui_schema: Dict[str, Any] = Field(default=None, description="Dynamic UI JSON schema.")
    bypass_wake_word: bool = Field(default=False, description="Whether to activate mic immediately.")

@tool(args_schema=ShowGraphInput)
def show_graph(view: Literal['center', 'side'], content: str, options: list[str] = None, ui_schema: dict = None, bypass_wake_word: bool = False):
    """
    Displays a graphical interface (UI) to the user.
    
    Use 'side' for extra info, lists, or reports.
    Use 'center' for dialogs requiring user action.

    Args:
        view (str): 'center' or 'side'.
        content (str): Markdown content.
        options (list[str], optional): Button labels.
        ui_schema (dict, optional): UI schema.
        bypass_wake_word (bool): Whether to bypass wake word.

    Returns:
        str: Confirmation message.
    """
    import main
    import asyncio
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
    """
    Closes any open UI and reactivates Wake Word.

    Returns:
        str: Confirmation message.
    """
    import main
    import asyncio
    main.set_graph_state(None, False)
    payload = {"type": "graph_close"}
    if main.main_loop:
        asyncio.run_coroutine_threadsafe(main.broadcast_to_sockets(payload), main.main_loop)
    return "Interface closed."


@tool
def ask_confirmation(message: str, options: list[str] = None):
    """
    Shows a confirmation dialog in the Center UI.

    Args:
        message (str): The confirmation message.
        options (list[str], optional): Button labels. Defaults to ["Yes", "No"].

    Returns:
        str: Tool output message.
    """
    if options is None: options = ["Yes", "No"]
    return show_graph.invoke({
        "view": "center", "content": f"### Confirmation Required\n\n{message}",
        "options": options, "bypass_wake_word": True
    })


@tool
def open_model_selector():
    """
    Opens the AI model selector in the Center UI.

    Returns:
        str: Tool output message.
    """
    return show_graph.invoke({
        "view": "center",
        "content": "### Select AI Model\n\nChoose the brain I should use.",
        "options": ["Local", "Groq", "Gemini"],
        "bypass_wake_word": True
    })


@tool
def switch_ai_model(mode: Literal['local', 'groq', 'gemini']):
    """
    Switches the current AI model provider.

    Args:
        mode (str): The model provider ('local', 'groq', 'gemini').

    Returns:
        str: Confirmation or error message.
    """
    import ai.orchestrator as orchestrator
    try:
        orchestrator.initialize_llm(mode)
        return f"OK: Switching to {mode}"
    except Exception as e:
        return f"Error: {str(e)}"


class SetReminderInput(BaseModel):
    title: str = Field(description="Short title.")
    content: str = Field(default="", description="Extra details.")
    time_str: str = Field(description="Time or duration (e.g., '16:00', 'in 5 minutes').")
    repeat_interval: Literal['minutes', 'hours', 'days', 'weeks', 'months'] = Field(default=None)
    repeat_value: int = Field(default=1)

@tool(args_schema=SetReminderInput)
def set_reminder(title: str, time_str: str, content: str = "", repeat_interval: str = None, repeat_value: int = 1):
    """
    Schedules a reminder or task.

    Args:
        title (str): Reminder title.
        time_str (str): Natural language time.
        content (str, optional): Detailed content.
        repeat_interval (str, optional): Recurrence interval.
        repeat_value (int, optional): Recurrence frequency.

    Returns:
        str: Confirmation or error message.
    """
    import main
    from datetime import datetime, timedelta
    import dateparser
    now = datetime.now()
    scheduled_time = dateparser.parse(time_str, settings={'RELATIVE_BASE': now, 'PREFER_DATES_FROM': 'future'})
    if not scheduled_time: return "Error: Could not understand time."
    if scheduled_time < now and "every" not in time_str.lower():
        if (now - scheduled_time).total_seconds() < 86400: scheduled_time += timedelta(days=1)
    if main.reminder_manager is None: return "Error: Manager not ready."
    main.reminder_manager.add_reminder(title=title, content=content, scheduled_time=scheduled_time, repeat_interval=repeat_interval, repeat_value=repeat_value)
    return f"Reminder '{title}' scheduled for {scheduled_time.strftime('%H:%M')}."


@tool
def list_reminders():
    """
    Lists all scheduled reminders.

    Returns:
        str: Formatted list of reminders.
    """
    import main
    reminders = main.reminder_manager.list_reminders()
    if not reminders: return "No active reminders."
    res = "REMINDERS_LIST:\n"
    for r in reminders:
        status = "[ACTIVE]" if r.is_active else "[INACTIVE]"
        res += f"- {status} {r.title}: {r.scheduled_time.strftime('%H:%M')}\n"
    return res


@tool
def cancel_reminder(reminder_id: int):
    """
    Cancels a reminder by ID.

    Args:
        reminder_id (int): ID of the reminder to cancel.

    Returns:
        str: Confirmation message.
    """
    import main
    main.reminder_manager.delete_reminder(reminder_id)
    return f"Reminder {reminder_id} canceled."


@tool
def jump_to_folder(folder_name: str):
    """
    Opens File Explorer in a matching folder by name.

    Args:
        folder_name (str): Name of the folder to find.

    Returns:
        str: Confirmation or error message.
    """
    user_home = Path.home()
    folder_name = folder_name.lower().strip()
    if folder_name in FOLDER_ALIASES:
        target = user_home / FOLDER_ALIASES[folder_name]
        if target.exists():
            os.startfile(target)
            return f"Opening {folder_name}."
    search_roots = [user_home / "Documents", user_home / "Desktop", user_home / "Downloads", user_home]
    for root in search_roots:
        if not root.exists(): continue
        try:
            for p in root.glob(f"**/{folder_name}*"):
                if p.is_dir() and not any(ign in p.parts for ign in {'.git', 'node_modules', 'AppData'}):
                    os.startfile(p)
                    return f"Folder '{p.name}' opened."
        except Exception: continue
    return f"Folder '{folder_name}' not found."

_proc_cache = {}

def get_momai_resources():
    """
    Calculates resource consumption of the MomAI processes.

    Returns:
        dict: Usage statistics (RAM, CPU, VRAM).
    """
    global _proc_cache
    try:
        current_pid = os.getpid()
        momai_pids = set()
        
        # 1. Fast process search (PID and Name first)
        for p in psutil.process_iter(['pid', 'name']):
            try:
                name = p.info['name'].lower()
                pid = p.info['pid']
                
                if any(x in name for x in ["momai", "electron", "llama-server"]):
                    momai_pids.add(pid)
                elif "python" in name:
                    # Check if it's our python by working directory
                    try:
                        if pid == current_pid or "apps\\core" in p.cwd().lower():
                            momai_pids.add(pid)
                    except: pass
            except: continue

        total_ram = 0
        total_cpu = 0
        new_cache = {}
        
        for pid in momai_pids:
            try:
                p = _proc_cache.get(pid) or psutil.Process(pid)
                if p.is_running():
                    new_cache[pid] = p
                    mem = p.memory_info().rss
                    total_ram += mem
                    # First call to cpu_percent always returns 0,
                    # subsequent calls using the cache will return correct values.
                    total_cpu += p.cpu_percent()
            except: continue
        
        _proc_cache = new_cache

        # 2. GPU VRAM (Direct WMI Query - Filtering by main controller)
        vram_used = 0
        vram_total = 0
        if platform.system() == "Windows":
            try:
                # Select the controller with most RAM (usually the dedicated one)
                cmd_vram = "powershell -NoProfile -Command \"$gpu = Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1; $used = (Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory | Where-Object { $_.Name -like \"*$($gpu.PNPDeviceID.Replace('\\', '#'))*\" } | Measure-Object -Property DedicatedUsage -Sum).Sum; if (!$used) { $used = (Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory | Measure-Object -Property DedicatedUsage -Max).Maximum }; echo \\\"$($gpu.AdapterRAM),$used\\\"\""
                
                res = subprocess.run(cmd_vram, capture_output=True, text=True, timeout=1.5, shell=True, encoding='utf-8', errors='replace')
                if res.returncode == 0 and "," in res.stdout:
                    parts = res.stdout.strip().split(",")
                    raw_total = float(parts[0]) if parts[0] else 0
                    raw_used = float(parts[1]) if parts[1] else 0
                    
                    vram_total = int(raw_total / (1024 * 1024))
                    vram_used = int(raw_used / (1024 * 1024))
            except: pass

        return {
            "ram_mb": round(total_ram / (1024 * 1024), 1),
            "cpu_percent": round(total_cpu, 1),
            "vram_used_mb": vram_used,
            "vram_total_mb": vram_total
        }
    except Exception:
        return {"ram_mb": 0, "cpu_percent": 0, "vram_used_mb": 0, "vram_total_mb": 0}

@tool
def get_momai_resources_tool():
    """
    Calculates the resource consumption (RAM, CPU, VRAM) of the entire MomAI family.
    
    Includes Backend, Frontend, and AI Engine. Useful to check performance.

    Returns:
        str: Markdown report.
    """
    data = get_momai_resources()
    return (
        f"### MomAI Status\n\n"
        f"- **RAM:** {data['ram_mb']} MB\n"
        f"- **CPU:** {data['cpu_percent']}%\n"
        f"- **GPU VRAM:** {data['vram_used_mb']} / {data['vram_total_mb']} MB"
    )

# Export
TOOLS = [
    get_current_time, get_system_stats, system_control,
    search_filesystem, jump_to_folder, open_browser, web_scrape, manage_process,
    open_program, open_file, manage_window,
    show_graph, close_graph, ask_confirmation, open_model_selector, switch_ai_model,
    set_reminder, list_reminders, cancel_reminder, get_momai_resources_tool
]

AVAILABLE_TOOLS = {t.name: t for t in TOOLS}