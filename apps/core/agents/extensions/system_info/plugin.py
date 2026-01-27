import platform
import os
import subprocess
import psutil
import pygetwindow as gw
from pathlib import Path
from datetime import datetime
from typing import Literal, List, Dict, Any
from pydantic import BaseModel, Field
from langchain_core.tools import tool
from services.extensions.hooks import hookimpl

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
    """Returns current time in HH:MM format."""
    return datetime.now().strftime("%H:%M")

@tool
def get_system_stats():
    """Returns vital system statistics focused on Windows performance."""
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
def system_control(command: str):
    """Executes Windows OS control commands (Volume, Screen Lock, Power)."""
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
            return "System will shutdown in 60 seconds."
        elif command == "restart":
            subprocess.run("shutdown /r /t 60", shell=True)
            return "System will restart in 60 seconds."
    except Exception as e:
        return f"Error controlling system: {str(e)}"

@tool
def manage_process(process_name: str, action: Literal['check', 'kill'] = 'check'):
    """Manages Windows processes by name."""
    count = 0
    for proc in psutil.process_iter(['name']):
        if process_name.lower() in proc.info['name'].lower():
            if action == 'kill': proc.kill()
            count += 1
    verb = "Terminated" if action == 'kill' else "Found"
    return f"{verb} {count} instances of {process_name}."

@tool
def manage_window(title: str, action: Literal['focus', 'close', 'minimize', 'maximize']):
    """Controls application windows."""
    windows = gw.getWindowsWithTitle(title)
    if not windows: return f"No window found with title '{title}'"
    win = windows[0]
    try:
        if action == 'focus': win.activate()
        elif action == 'close': win.close()
        elif action == 'minimize': win.minimize()
        elif action == 'maximize': win.maximize()
        return f"Executed {action} on '{win.title}'"
    except Exception as e:
        return f"Window error: {str(e)}"

class SearchFilesystemInput(BaseModel):
    query: str = Field(description="Search pattern.")
    search_type: Literal['file', 'folder', 'both'] = Field(default='both')
    location_alias: str = Field(default="common")

@tool(args_schema=SearchFilesystemInput)
def search_filesystem(query: str, search_type: str = 'both', location_alias: str = "common") -> str:
    """Locates files or folders on the user's PC."""
    user_home = Path.home()
    roots = [user_home / "Documents", user_home / "Desktop", user_home / "Downloads"]
    results = []
    for root in roots:
        if not root.exists(): continue
        for p in root.rglob(f"*{query}*"):
            if len(results) >= 20: break
            results.append(f"{'📁' if p.is_dir() else '📄'} {p.name} ({p})")
    return "SEARCH_RESULTS:\n" + "\n".join(results) if results else "No items found."

@tool
def open_program(name: str):
    """Opens a Windows program."""
    try:
        os.startfile(name)
        return f"Launched {name}."
    except Exception as e:
        return f"Failed: {e}"

@tool
def open_file(file_path: str):
    """Opens a file with default app."""
    try:
        os.startfile(file_path)
        return f"Opening {file_path}..."
    except Exception as e:
        return f"Error: {e}"

@hookimpl
def register_tools():
    return [
        get_current_time, 
        get_system_stats, 
        system_control, 
        manage_process, 
        manage_window,
        search_filesystem,
        open_program,
        open_file
    ]

@hookimpl
def register_sidebar_items():
    return [{
        "id": "system-info-view",
        "icon": "Cpu",
        "label": "Sistema",
        "view": "SystemInfoDashboard"
    }]

@hookimpl
def on_startup():
    print("[SystemInfo] Extensão de Informações do Sistema ativa!")