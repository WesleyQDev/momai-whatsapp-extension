from langchain_core.tools import tool
from pydantic import BaseModel, Field
import webbrowser
from langchain_community.tools import DuckDuckGoSearchRun
from typing import List, Literal, Dict, Any, Optional
import os
import re
from utils.i18n import t, get_locale

import asyncio
import app_state

# Search instance
search = DuckDuckGoSearchRun()

# Global state
current_mode = "local"
version = "v0"

MIN_INTERFACE_CHARS = int(os.getenv("MOMAI_MIN_INTERFACE_CHARS", "240"))

_MISSING_CAPABILITY_UI_PATTERNS = [
    r"acesso negado",
    r"nao posso acessar",
    r"não posso acessar",
    r"nao tenho acesso",
    r"não tenho acesso",
    r"nao tenho como",
    r"não tenho como",
    r"cannot access",
    r"access denied",
]


def _get_min_interface_chars() -> int:
    env_value = os.getenv("MOMAI_MIN_INTERFACE_CHARS")
    if env_value:
        try:
            return int(env_value)
        except Exception:
            return MIN_INTERFACE_CHARS

    try:
        from database.models import SessionLocal, Settings

        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            if settings and settings.min_interface_chars:
                return int(settings.min_interface_chars)
        finally:
            db.close()
    except Exception:
        pass

    return MIN_INTERFACE_CHARS


def _should_offer_extension_store(
    content: str, options: list[str] | None, ui_schema: dict | None
) -> bool:
    if options or ui_schema:
        return False
    if not content:
        return False
    lowered = content.lower()
    return any(re.search(pat, lowered) for pat in _MISSING_CAPABILITY_UI_PATTERNS)


def _should_use_side_panel(
    content: str, options: list[str] | None, ui_schema: dict | None
) -> bool:
    if ui_schema or (options and len(options) > 0):
        return True
    if not content:
        return False

    if len(content) >= _get_min_interface_chars():
        return True

    if re.search(r"(^|\n)\s*[-*]\s+", content):
        return True
    if re.search(r"(^|\n)#{1,6}\s+", content):
        return True
    if "```" in content:
        return True
    if "|" in content and "\n" in content:
        return True

    return False


class ShowInterfaceInput(BaseModel):
    view: Literal["side"] = Field(
        default="side", description="The view type. Currently only 'side' is supported."
    )
    content: str = Field(description="Markdown content to display.")
    options: List[str] = Field(default=[], description="Action buttons for the user.")
    ui_schema: Dict[str, Any] = Field(
        default=None, description="Dynamic UI JSON schema."
    )
    bypass_wake_word: bool = Field(
        default=False, description="Whether to activate mic immediately."
    )


class ShowChatCardInput(BaseModel):
    content: str = Field(description="Markdown content to display.")
    options: List[str] = Field(default=[], description="Action buttons for the user.")
    options_map: Dict[str, str] = Field(
        default=None, description="Optional label map for options."
    )
    ui_schema: Dict[str, Any] = Field(
        default=None, description="Dynamic UI JSON schema."
    )


@tool(args_schema=ShowInterfaceInput)
def show_interface(
    content: str,
    view: Literal["side"] = "side",
    options: list[str] = None,
    ui_schema: dict = None,
    bypass_wake_word: bool = False,
):
    """
    Displays a graphical side interface (UI) to the user.
    MANDATORY Usage: Use this whenever the user asks to "show", "list", or "open interface", OR when displaying lists, markdown tables, or long content.
    """
    if options is None:
        options = []
    # Force view to be 'side' just in case
    view = "side"

    if _should_offer_extension_store(content, options, ui_schema):
        locale = get_locale()
        return show_chat_card.invoke(
            {
                "content": t("missing_capability_card_content", locale=locale),
                "options": ["open_extensions_store"],
                "options_map": {
                    "open_extensions_store": t(
                        "missing_capability_card_cta", locale=locale
                    )
                },
            }
        )

    if not _should_use_side_panel(content, options, ui_schema):
        return show_chat_card.invoke(
            {"content": content, "options": options, "ui_schema": ui_schema}
        )
    app_state.set_graph_state(view, bypass_wake_word)

    graph_data = {
        "view": view,
        "content": content,
        "options": options,
        "ui_schema": ui_schema,
        "bypass_wake_word": bypass_wake_word,
    }

    # Register for persistence (will be saved with the message)
    # Get thread_id from current context if available, otherwise use default
    import threading

    thread_id = getattr(threading.current_thread(), "_momai_thread_id", "default")
    app_state.set_pending_graph_data(thread_id, graph_data)

    payload = {"type": "graph_open", "data": graph_data}
    if app_state.main_loop:
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets(payload), app_state.main_loop
        )
    return f"Interface '{view}' opened."


@tool(args_schema=ShowChatCardInput)
def show_chat_card(
    content: str,
    options: list[str] = None,
    options_map: dict = None,
    ui_schema: dict = None,
):
    """Displays a chat-only card without opening side or center panels."""
    if options is None:
        options = []
    if options_map is None:
        options_map = {}
    graph_data = {
        "view": "chat",
        "content": content,
        "options": options,
        "options_map": options_map,
        "ui_schema": ui_schema,
        "bypass_wake_word": False,
    }

    import threading

    thread_id = getattr(threading.current_thread(), "_momai_thread_id", "default")
    app_state.set_pending_graph_data(thread_id, graph_data)

    payload = {"type": "graph_open", "data": graph_data}
    if app_state.main_loop:
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets(payload), app_state.main_loop
        )
    return "Chat card opened."


@tool
def close_interface():
    """Closes any open UI."""
    app_state.set_graph_state(None, False)
    payload = {"type": "graph_close"}
    if app_state.main_loop:
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets(payload), app_state.main_loop
        )
    return "Interface closed."


@tool
def ask_confirmation(message: str, options: list[str] = None):
    """Shows a confirmation dialog in the UI."""
    if options is None:
        options = ["Yes", "No"]
    return show_interface.invoke(
        {
            "view": "side",
            "content": f"### Confirmation Required\n\n{message}",
            "options": options,
            "bypass_wake_word": True,
        }
    )


@tool
def open_model_selector():
    """Opens the AI model selector."""
    return show_interface.invoke(
        {
            "view": "side",
            "content": "### Modelo Local\n\nNo momento o MomAI opera exclusivamente de forma local e privada.",
            "options": ["Local"],
            "bypass_wake_word": True,
        }
    )


@tool
def switch_ai_model(mode: Literal["local"]):
    """Switches the current AI model provider. Only 'local' is supported."""
    import ai.orchestrator as orchestrator

    try:
        orchestrator.initialize_llm("local")
        return f"OK: Switching to local"
    except Exception as e:
        return f"Error: {str(e)}"


@tool
def open_extension_store():
    """Opens the Extension Store in the main interface."""
    return _broadcast_ui_event(
        "navigate", {"path": "/extensions", "state": {"tab": "store"}}
    )


def _broadcast_ui_event(event_type: str, data: dict) -> str:
    payload = {"type": event_type, "data": data}
    if app_state.main_loop:
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets(payload), app_state.main_loop
        )
        return "OK"
    return "Error: Main loop not ready."


def _apply_settings(
    tts_voice: str | None = None,
    tts_enabled: bool | None = None,
    wake_word_enabled: bool | None = None,
) -> str:
    from database.models import SessionLocal, Settings

    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings()
            db.add(settings)
            db.commit()

        if tts_voice is not None:
            settings.tts_voice = tts_voice
        if tts_enabled is not None:
            settings.tts_enabled = tts_enabled
        if wake_word_enabled is not None:
            settings.wake_word_enabled = wake_word_enabled

        db.commit()
        db.refresh(settings)

        if tts_voice is not None and getattr(app_state, "tts", None):
            app_state.tts.tts.set_voice(settings.tts_voice)

        if tts_enabled is not None and getattr(app_state, "tts", None):
            app_state.tts.tts.set_enabled(settings.tts_enabled)

        if wake_word_enabled is not None and getattr(app_state, "ww", None):
            if settings.wake_word_enabled:
                app_state.ww.start()
            else:
                app_state.ww.stop()

        return "OK"
    finally:
        db.close()


@tool
def set_theme(theme: Literal["dark", "light"]):
    """Changes the application theme."""
    if theme not in ["dark", "light"]:
        return "Error: invalid theme"
    return _broadcast_ui_event("set_theme", {"theme": theme})


@tool
def open_settings_panel(
    tab: Literal["general", "brain", "voice", "economy", "updates"] = "general",
):
    """Opens the settings panel at a specific tab."""
    return _broadcast_ui_event("open_settings", {"tab": tab})


@tool
def open_sidebar_tab(
    tab: Literal["chat", "notes", "agenda", "extensions", "store", "extension"],
    extension_id: Optional[str] = None,
    agent_name: Optional[str] = None,
    extensions_tab: Optional[Literal["store", "installed", "system"]] = None,
):
    """Navigates to a sidebar tab or extension view."""
    path = "/"
    state = None

    if tab == "notes":
        path = "/notes"
    elif tab == "extensions":
        path = "/extensions"
        if extensions_tab:
            state = {"tab": extensions_tab}
    elif tab == "store":
        path = "/extensions"
        state = {"tab": "store"}
    elif tab == "agenda":
        try:
            from services.extensions.manager import extension_manager

            manifest = extension_manager.get_agent_manifest("scheduler")
            if manifest:
                path = f"/extensions/{manifest.id}"
            else:
                return "Error: scheduler extension not found"
        except Exception:
            return "Error: scheduler extension not available"
    elif tab == "extension":
        if not extension_id and agent_name:
            try:
                from services.extensions.manager import extension_manager

                manifest = extension_manager.get_agent_manifest(agent_name)
                if manifest:
                    extension_id = manifest.id
            except Exception:
                pass
        if not extension_id:
            return "Error: extension_id is required"
        path = f"/extensions/{extension_id}"

    return _broadcast_ui_event("navigate", {"path": path, "state": state})


@tool
def set_tts_enabled(enabled: bool):
    """Enables or disables TTS."""
    return _apply_settings(tts_enabled=enabled)


@tool
def set_wake_word_enabled(enabled: bool):
    """Enables or disables the wake word detector."""
    return _apply_settings(wake_word_enabled=enabled)


@tool
def set_tts_voice(voice: str):
    """Sets the TTS voice by catalog id."""
    if not voice:
        return "Error: voice is required"
    return _apply_settings(tts_voice=voice)


@tool
def get_tts_voice_catalog():
    """Returns the local TTS voice catalog."""
    return {
        "pt-BR": ["pf_dora", "pm_alex", "pm_santa"],
        "en-US": ["af_heart", "af_bella", "am_adam", "am_fenrir"],
        "en-UK": ["bf_alice", "bm_george"],
        "es": ["ef_dora", "em_alex"],
        "it": ["if_sara", "im_nicola"],
    }


@tool
def add_fortscript_app(name: str, executable: str):
    """Adds a program to FortScript monitoring (economy mode)."""
    if not name or not executable:
        return "Error: name and executable are required"

    from database.models import SessionLocal, GamingApp

    exe_norm = executable.strip().lower()
    db = SessionLocal()
    try:
        existing = db.query(GamingApp).filter(GamingApp.executable == exe_norm).first()
        if existing:
            existing.name = name
            existing.is_active = True
        else:
            db.add(GamingApp(name=name, executable=exe_norm, is_active=True))
        db.commit()
    finally:
        db.close()

    try:
        from services.system.resource_manager import resource_manager

        if resource_manager.thread and resource_manager.thread.is_alive():
            return "OK: app added (restart required to reload monitoring list)"
        resource_manager.start()
    except Exception:
        pass

    return "OK"


@tool
def stop_generation():
    """Stops the current AI response generation."""
    try:
        import ai.orchestrator as orchestrator

        orchestrator.request_cancel_generation()
        return "OK"
    except Exception as e:
        return f"Error: {str(e)}"


@tool
def stop_voice():
    """Stops any ongoing TTS playback."""
    try:
        import services.voice.tts as tts

        tts.stop_all()
        return "OK"
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
            "http://127.0.0.1:8080/v1/tokenize",
        ]
        payloads = [{"content": text}, {"text": text}]

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
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=1,
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
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=1,
            )
            total_mb = 0
            if total_result.returncode == 0:
                for line in total_result.stdout.strip().splitlines():
                    total_mb += int(line.strip())

            if used_mb > 0 or total_mb > 0:
                return used_mb, total_mb
        except Exception:
            pass

        if os.name == "nt":
            try:
                # Use GPUProcessMemory for per-process dedicated VRAM (works with AMD/NVIDIA/Intel)
                ps_command = (
                    "Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory "
                    "| Where-Object { $_.DedicatedUsage -gt 0 } "
                    "| Select-Object Name,DedicatedUsage "
                    "| ConvertTo-Json -Compress"
                )
                result = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", ps_command],
                    capture_output=True,
                    text=True,
                    timeout=5,
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
                        "(Get-ItemProperty -Path "
                        '"HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*" '
                        '-Name "HardwareInformation.qwMemorySize" -ErrorAction SilentlyContinue).'
                        '"HardwareInformation.qwMemorySize" | Measure-Object -Maximum '
                        "| Select-Object -ExpandProperty Maximum"
                    )
                    reg_result = subprocess.run(
                        ["powershell", "-NoProfile", "-Command", reg_command],
                        capture_output=True,
                        text=True,
                        timeout=5,
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
                timeout=2,
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
        for p in psutil.process_iter(["pid", "name"]):
            try:
                name = (p.info.get("name") or "").lower()
                if any(
                    x in name for x in ["momai", "electron", "llama-server", "python"]
                ):
                    momai_pids.add(p.info["pid"])
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
            "context_total_tokens": ctx_total,
        }
    except Exception:
        return {
            "ram_mb": 0,
            "vram_used_mb": 0,
            "vram_total_mb": 0,
            "context_used_tokens": 0,
            "context_total_tokens": 0,
        }


@tool
def get_momai_resources_tool():
    """Displays resource consumption."""
    data = get_momai_resources()
    ctx_used = data.get("context_used_tokens", 0)
    ctx_total = data.get("context_total_tokens", 0)
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
    scheduled_time: str = Field(
        description="Date and time for the FIRST trigger in ISO format (YYYY-MM-DD HH:MM:SS). For recurring reminders, set this to NOW or NOW + interval."
    )
    repeat_interval: Literal["minutes", "hours", "days", "weeks", "months"] = Field(
        default=None,
        description="Interval unit for repetition (e.g., 'minutes' for every N minutes).",
    )
    repeat_value: int = Field(
        default=None,
        description="Value for interval (e.g., 25 for 'every 25 minutes').",
    )


@tool(args_schema=CreateReminderInput)
def create_reminder_tool(
    title: str,
    scheduled_time: str,
    content: str = None,
    repeat_interval: str = None,
    repeat_value: int = None,
):
    """Schedules a new reminder or alarm. For RECURRING reminders, set scheduled_time to NOW (or NOW + interval) and provide repeat_interval + repeat_value."""
    from datetime import datetime

    try:
        dt = datetime.fromisoformat(scheduled_time)
        if not app_state.reminder_manager:
            return "Error: Reminder manager not ready."
        app_state.reminder_manager.add_reminder(
            title, content, dt, repeat_interval, repeat_value
        )
        return f"OK: Reminder '{title}' scheduled for {scheduled_time}."
    except Exception as e:
        return f"Error scheduling: {str(e)}"


@tool
def list_reminders_tool():
    """Lists all active reminders and their schedules."""
    if not app_state.reminder_manager:
        return "Reminder system not initialized."
    reminders = app_state.reminder_manager.list_reminders()
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
    if not app_state.reminder_manager:
        return "Error: Reminder manager not ready."
    app_state.reminder_manager.delete_reminder(reminder_id)
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
    hidden_tools = [
        "switch_ai_model",
        "open_model_selector",
        "get_momai_resources_tool",
        "get_capabilities",
        "show_chat_card",
        "open_extension_store",
    ]

    for t in TOOLS:
        if t.name in hidden_tools:
            continue

        # Custom overrides for better display
        if t.name == "duckduckgo_search":
            desc = "Search the internet for real-time information. IMPORTANT: If the user asks about multiple different topics or locations, make SEPARATE calls for EACH one. For example, if they ask about weather in São Paulo AND Rio de Janeiro, call this tool twice - once for each location. Never combine multiple queries in a single call."
            name = "Internet Search"
        else:
            desc = t.description.split("\n")[0] if t.description else "No description"
            name = t.name

        report += f"- {name}: {desc}\n"

    # 2. Extensions
    ext_tools = extension_manager.get_tools()
    if ext_tools:
        report += "\nInstalled Extensions:\n"
        for t in ext_tools:
            desc = t.description.split("\n")[0] if t.description else "No description"
            report += f"- {t.name}: {desc}\n"
    else:
        report += "\nExtensions: None installed.\n"

    return report


# Core Tools
search.name = "duckduckgo_search"
search.description = "Search the internet for real-time information. IMPORTANT: If the user asks about multiple different topics or locations, make SEPARATE calls for EACH one. For example, if they ask about weather in São Paulo AND Rio de Janeiro, call this tool twice - once for each location. Never combine multiple queries in a single call."

TOOLS = [
    search,
    show_interface,
    show_chat_card,
    close_interface,
    ask_confirmation,
    open_extension_store,
    set_theme,
    open_settings_panel,
    open_sidebar_tab,
    set_tts_enabled,
    set_wake_word_enabled,
    set_tts_voice,
    get_tts_voice_catalog,
    add_fortscript_app,
    stop_generation,
    stop_voice,
    get_momai_resources_tool,
    create_reminder_tool,
    list_reminders_tool,
    delete_reminder_tool,
    get_capabilities,
]

AVAILABLE_TOOLS = {t.name: t for t in TOOLS}

# Explicit Safe List for Native Tools (avoids Pydantic attribute errors)
SAFE_TOOLS_NAMES = {
    "duckduckgo_search",
    "show_interface",
    "show_chat_card",
    "close_interface",
    "ask_confirmation",
    "open_extension_store",
    "set_theme",
    "open_settings_panel",
    "open_sidebar_tab",
    "set_tts_enabled",
    "set_wake_word_enabled",
    "set_tts_voice",
    "get_tts_voice_catalog",
    "add_fortscript_app",
    "stop_generation",
    "stop_voice",
    "get_momai_resources_tool",
    "create_reminder_tool",
    "list_reminders_tool",
    "get_capabilities",
}

_TOOL_REGISTRY_CACHE: dict[str, Any] = {"registry": None}


def invalidate_tools_registry_cache() -> None:
    _TOOL_REGISTRY_CACHE["registry"] = None


def get_all_tools_registry(force_refresh: bool = False):
    """Returns a unified dictionary of all tools (native + extensions)."""
    from services.extensions.manager import extension_manager
    from utils.safe_tools import SafeExtensionTool

    if not force_refresh and _TOOL_REGISTRY_CACHE["registry"] is not None:
        return _TOOL_REGISTRY_CACHE["registry"].copy()

    registry = AVAILABLE_TOOLS.copy()

    ext_tools = extension_manager.get_tools()
    for t in ext_tools:
        # Don't re-wrap tools that are already SafeExtensionTool
        if isinstance(t, SafeExtensionTool):
            registry[t.name] = t
        else:
            registry[t.name] = SafeExtensionTool(original_tool=t)

    _TOOL_REGISTRY_CACHE["registry"] = registry
    return registry.copy()


def get_all_tools_list():
    """Returns a list of all tools (native + extensions)."""
    return list(get_all_tools_registry().values())
