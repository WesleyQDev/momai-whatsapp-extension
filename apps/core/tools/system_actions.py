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
    import psutil, os, subprocess, re, json
    from pathlib import Path
    import requests
    from database.models import SessionLocal, Message

    def _get_context_total():
        try:
            from ai.providers import local_llama
            return int(getattr(local_llama, "CTX_SIZE", 8192))
        except Exception:
            return int(os.getenv("MOMAI_CTX_SIZE", "8192"))

    def _tokenize_text(text: str) -> int:
        if not text:
            return 0

        endpoints = [
            "http://127.0.0.1:8080/tokenize",
            "http://127.0.0.1:8080/v1/tokenize"
        ]
        payloads = [
            {"content": text},
            {"text": text}
        ]

        for url in endpoints:
            for payload in payloads:
                try:
                    res = requests.post(url, json=payload, timeout=1)
                    if not res.ok:
                        continue
                    data = res.json()
                    if isinstance(data, dict):
                        if isinstance(data.get("tokens"), list):
                            return len(data["tokens"])
                        if isinstance(data.get("token_count"), int):
                            return int(data["token_count"])
                    if isinstance(data, list):
                        return len(data)
                except Exception:
                    continue
        return 0

    def _get_context_used_tokens():
        try:
            db = SessionLocal()
            messages = (
                db.query(Message)
                .filter(Message.thread_id == "default")
                .order_by(Message.created_at.desc())
                .limit(24)
                .all()
            )
            db.close()

            if not messages:
                return 0

            lines = []
            for msg in reversed(messages):
                role = msg.role or ""
                content = msg.content or ""
                lines.append(f"{role}: {content}")

            combined = "\n".join(lines)
            return _tokenize_text(combined)
        except Exception:
            return 0

    def _get_vram_usage(momai_pids: set[int]):
        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-compute-apps=pid,used_memory",
                    "--format=csv,noheader,nounits"
                ],
                capture_output=True,
                text=True,
                timeout=1
            )
            used_mb = 0
            if result.returncode == 0:
                for line in result.stdout.strip().splitlines():
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) != 2:
                        continue
                    pid = int(parts[0])
                    mem = int(parts[1])
                    if pid in momai_pids:
                        used_mb += mem

            total_result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=memory.total",
                    "--format=csv,noheader,nounits"
                ],
                capture_output=True,
                text=True,
                timeout=1
            )
            total_mb = 0
            if total_result.returncode == 0:
                for line in total_result.stdout.strip().splitlines():
                    total_mb += int(line.strip())

            if used_mb > 0 or total_mb > 0:
                return used_mb, total_mb
        except Exception:
            pass

        if os.name == 'nt':
            try:
                # Use GPUProcessMemory for per-process dedicated VRAM (works with AMD/NVIDIA/Intel)
                ps_command = (
                    'Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory '
                    '| Where-Object { $_.DedicatedUsage -gt 0 } '
                    '| Select-Object Name,DedicatedUsage '
                    '| ConvertTo-Json -Compress'
                )
                result = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        ps_command
                    ],
                    capture_output=True,
                    text=True,
                    timeout=5
                )

                used_bytes = 0
                if result.returncode == 0 and result.stdout.strip():
                    data = json.loads(result.stdout)
                    if isinstance(data, dict):
                        data = [data]

                    for item in data:
                        # Name format: "pid_<PID>_luid_0x..._phys_0"
                        name = str(item.get("Name", ""))
                        try:
                            pid = int(name.split("_")[1])
                        except (IndexError, ValueError):
                            continue
                        if pid in momai_pids:
                            used_bytes += float(item.get("DedicatedUsage", 0))

                # Get total VRAM capacity from registry (64-bit, avoids uint32 overflow)
                total_bytes = 0
                try:
                    reg_command = (
                        '(Get-ItemProperty -Path '
                        '"HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*" '
                        '-Name "HardwareInformation.qwMemorySize" -ErrorAction SilentlyContinue).'
                        '"HardwareInformation.qwMemorySize" | Measure-Object -Maximum '
                        '| Select-Object -ExpandProperty Maximum'
                    )
                    reg_result = subprocess.run(
                        ["powershell", "-NoProfile", "-Command", reg_command],
                        capture_output=True, text=True, timeout=5
                    )
                    if reg_result.returncode == 0 and reg_result.stdout.strip():
                        total_bytes = float(reg_result.stdout.strip())
                except Exception:
                    pass

                used_mb = int(used_bytes / (1024 * 1024)) if used_bytes > 0 else 0
                total_mb = int(total_bytes / (1024 * 1024)) if total_bytes > 0 else 0
                return used_mb, total_mb
            except Exception:
                return 0, 0

        # Linux fallbacks (AMD/Intel)
        try:
            result = subprocess.run(
                ["rocm-smi", "--showmemuse", "--json"],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0 and result.stdout.strip():
                data = json.loads(result.stdout)
                used_mb = 0
                total_mb = 0
                if isinstance(data, dict):
                    for _, gpu in data.items():
                        vram = gpu.get("VRAM", {}) if isinstance(gpu, dict) else {}
                        used_mb += int(float(vram.get("Used", 0)))
                        total_mb += int(float(vram.get("Total", 0)))
                if used_mb > 0 or total_mb > 0:
                    return used_mb, total_mb
        except Exception:
            pass

        try:
            used_total = 0
            total_total = 0
            drm_path = Path("/sys/class/drm")
            if drm_path.exists():
                for device in drm_path.glob("card*/device"):
                    total_path = device / "mem_info_vram_total"
                    used_path = device / "mem_info_vram_used"
                    if total_path.exists():
                        total_total += int(total_path.read_text().strip())
                    if used_path.exists():
                        used_total += int(used_path.read_text().strip())

            used_mb = int(used_total / (1024 * 1024)) if used_total > 0 else 0
            total_mb = int(total_total / (1024 * 1024)) if total_total > 0 else 0
            return used_mb, total_mb
        except Exception:
            return 0, 0

    try:
        total_ram = 0
        momai_pids: set[int] = set()
        for p in psutil.process_iter(['pid', 'name']):
            try:
                name = (p.info.get('name') or '').lower()
                if any(x in name for x in ["momai", "electron", "llama-server", "python"]):
                    momai_pids.add(p.info['pid'])
                    total_ram += p.memory_info().rss
            except Exception:
                continue

        vram_used_mb, vram_total_mb = _get_vram_usage(momai_pids)
        ctx_total = _get_context_total()
        ctx_used = _get_context_used_tokens()

        return {
            "ram_mb": round(total_ram / 1024**2, 1),
            "vram_used_mb": vram_used_mb,
            "vram_total_mb": vram_total_mb,
            "context_used_tokens": ctx_used,
            "context_total_tokens": ctx_total
        }
    except Exception:
        return {
            "ram_mb": 0,
            "vram_used_mb": 0,
            "vram_total_mb": 0,
            "context_used_tokens": 0,
            "context_total_tokens": 0
        }

@tool
def get_momai_resources_tool():
    """Displays resource consumption."""
    data = get_momai_resources()
    ctx_used = data.get('context_used_tokens', 0)
    ctx_total = data.get('context_total_tokens', 0)
    ctx_free = max(ctx_total - ctx_used, 0)
    return (
        "### MomAI Status\n\n"
        f"- **RAM:** {data['ram_mb']} MB\n"
        f"- **VRAM:** {data['vram_used_mb']} / {data['vram_total_mb']} MB\n"
        f"- **Context:** {ctx_used} / {ctx_free} tokens"
    )



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
    """
    Retrieves a list of all available system tools and extensions.
    RETURNS the raw list. YOU (The AI) must then format this list into Markdown and use 'show_interface' to display it to the user.
    """
    from services.extensions.manager import extension_manager
    
    # 1. Native Tools
    report = "System Native Tools:\n"
    hidden_tools = ["switch_ai_model", "open_model_selector", "get_momai_resources_tool", "get_capabilities"]

    for t in TOOLS:
        if t.name in hidden_tools: continue
        
        # Custom overrides for better display
        if t.name == "duckduckgo_search":
            desc = "Search the internet for real-time information"
            name = "Internet Search"
        else:
            desc = t.description.split('\n')[0] if t.description else "No description"
            name = t.name

        report += f"- {name}: {desc}\n"

    # 2. Extensions
    ext_tools = extension_manager.get_tools()
    if ext_tools:
        report += "\nInstalled Extensions:\n"
        for t in ext_tools:
             desc = t.description.split('\n')[0] if t.description else "No description"
             report += f"- {t.name}: {desc}\n"
    else:
        report += "\nExtensions: None installed.\n"
        
    return report

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
    from utils.safe_tools import SafeExtensionTool
    
    registry = AVAILABLE_TOOLS.copy()
    
    ext_tools = extension_manager.get_tools()
    for t in ext_tools:
        # Wrap extension tools for safety
        registry[t.name] = SafeExtensionTool(original_tool=t)
        
    return registry

def get_all_tools_list():
    """Returns a list of all tools (native + extensions)."""
    return list(get_all_tools_registry().values())
