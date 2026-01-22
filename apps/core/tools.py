from langchain_core.tools import tool
from datetime import datetime
import platform
import os
import subprocess
import webbrowser
import psutil
from langchain_community.tools import DuckDuckGoSearchRun
from typing import List, Literal
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
    """Returns current time in HH:MM format."""
    return datetime.now().strftime("%H:%M")


@tool
def get_system_stats():
    """
    Returns vital system statistics focused on Windows performance.
    """
    cpu_usage = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    battery = psutil.sensors_battery()

    status = f"CPU: {cpu_usage}% | RAM: {mem.percent}% ({round(mem.used/1024**3, 1)}GB/{round(mem.total/1024**3, 1)}GB)"
    if battery:
        status += f" | Battery: {battery.percent}% {'(Charging)' if battery.power_plugged else '(Discharging)'}"

    return f"System Stats: {status}"


@tool
def system_control(command: Literal['volume_up', 'volume_down', 'mute', 'lock_screen']):
    """
    Controls Windows system functions.
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
            subprocess.run(
                "rundll32.exe user32.dll,LockWorkStation", shell=True)
            return "Windows locked."
    except Exception as e:
        return f"Error controlling system: {str(e)}"


@tool
def search_filesystem(query: str, search_type: Literal['file', 'folder', 'both'] = 'both', location_alias: str = "common") -> str:
    """
    Dynamically searches or lists files/folders (OneDrive Aware).

    Args:
        query: Pattern to look for. Use '*' to list ALL contents of a folder.
               Examples: '*.pdf', 'budget', '*'.
        search_type: 'file', 'folder', or 'both'.
        location_alias: Target folder alias (e.g., 'docs', 'downloads', 'desktop', 'pics').
    """
    user_home = Path.home()

    def _resolve_win_path(folder_name: str) -> Path:
        """Helper to check OneDrive first, then local."""
        onedrive = user_home / "OneDrive" / folder_name
        if onedrive.exists():
            return onedrive
        return user_home / folder_name

    # Resolve roots based on aliases
    search_roots = []
    alias = location_alias.lower().strip()

    if alias == "common":
        search_roots = [
            _resolve_win_path("Desktop"),
            _resolve_win_path("Documents"),
            _resolve_win_path("Downloads")
        ]
    elif alias == "home":
        search_roots = [user_home]
    elif alias in FOLDER_ALIASES:
        target_name = FOLDER_ALIASES[alias]
        search_roots = [_resolve_win_path(target_name)]
    else:
        # Check explicit paths
        onedrive_try = user_home / "OneDrive" / location_alias
        local_try = user_home / location_alias

        if onedrive_try.exists() and onedrive_try.is_dir():
            search_roots = [onedrive_try]
        elif local_try.exists() and local_try.is_dir():
            search_roots = [local_try]
        else:
            search_roots = [user_home]  # Fallback

    results = []
    limit = 25
    ignore = {'.git', 'node_modules', '__pycache__',
              'AppData', '$RECYCLE.BIN', 'System Volume Information'}

    is_listing = query.strip() == "*" or query.strip() == ""
    if is_listing:
        query = "*"

    for root in search_roots:
        if not root.exists():
            continue

        try:
            iterator = root.glob(
                query) if is_listing else root.rglob(f"*{query}*")

            for p in iterator:
                if any(ignored in p.parts for ignored in ignore):
                    continue

                is_dir = p.is_dir()
                if search_type == 'file' and is_dir:
                    continue
                if search_type == 'folder' and not is_dir:
                    continue

                icon = "📁" if is_dir else "📄"
                display_name = p.name if is_listing else str(
                    p.relative_to(user_home))
                results.append(f"{icon} {display_name}")

                if len(results) >= limit:
                    break
        except Exception:
            continue
        if len(results) >= limit:
            break

    if not results:
        return f"No items found for '{query}' in {location_alias} (Checked OneDrive & Local)."

    return f"Contents of {location_alias}:\n" + "\n".join(results)


@tool
def open_browser(url: str):
    """Opens a URL in the default browser."""
    if not url.startswith("http"):
        url = "https://" + url
    webbrowser.open(url)
    return f"Opening browser at {url}"


@tool
def manage_process(process_name: str, action: Literal['check', 'kill'] = 'check'):
    """Manages Windows processes using psutil."""
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
    """Opens a Windows program by name or URI."""
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
        file_path: Filename (e.g., 'report.pdf') or full path.
    """
    path_obj = Path(file_path)
    user_home = Path.home()

    # 1. Check absolute path or direct relative path
    if path_obj.exists():
        try:
            os.startfile(path_obj.resolve())
            return f"Opening '{path_obj.name}'..."
        except Exception as e:
            return f"Error opening file: {e}"

    # 2. Check standard folders (Smart Lookup)
    candidates = []
    # Add OneDrive paths if they exist
    candidates.append(user_home / "OneDrive" / "Documents" / file_path)
    candidates.append(user_home / "OneDrive" / "Desktop" / file_path)
    # Add local paths
    candidates.append(user_home / "Downloads" / file_path)
    candidates.append(user_home / "Documents" / file_path)
    candidates.append(user_home / "Desktop" / file_path)

    for cand in candidates:
        if cand.exists():
            try:
                os.startfile(cand)
                return f"Found and opening '{cand.name}'..."
            except Exception as e:
                return f"Error opening: {e}"

    # 3. Deep Search Fallback (Last Resort)
    # If the user says "open file.pdf" and it's in a subfolder "Docs/Project/file.pdf",
    # we scan Documents/Desktop to find it.
    print(
        f"[open_file] '{file_path}' not found in root folders, searching recursively...")

    search_roots = [
        user_home / "OneDrive" / "Documents",
        user_home / "Documents",
        user_home / "Desktop"
    ]

    # Limit recursion to avoid hanging
    for root in search_roots:
        if not root.exists():
            continue
        try:
            # Search for exact filename match recursively
            # Using rglob but limiting to first match
            matches = root.rglob(path_obj.name)
            first_match = next(matches, None)

            if first_match:
                try:
                    os.startfile(first_match)
                    return f"Located in '{first_match.parent.name}' and opening..."
                except Exception as e:
                    return f"Error opening found file: {e}"
        except Exception:
            continue

    return f"File '{file_path}' not found in standard folders or subfolders."


@tool
def manage_window(title: str, action: Literal['focus', 'close', 'minimize', 'maximize']):
    """Controls app windows on Windows."""
    windows = gw.getWindowsWithTitle(title)
    if not windows:
        return f"No window found with title '{title}'"

    win = windows[0]
    try:
        if action == 'focus':
            win.activate()
        elif action == 'close':
            win.close()
        elif action == 'minimize':
            win.minimize()
        elif action == 'maximize':
            win.maximize()
        return f"Executed {action} on '{win.title}'"
    except Exception as e:
        return f"Window error: {str(e)}"


# Export
TOOLS = [
    get_current_time, get_system_stats, system_control,
    search_filesystem, open_browser, manage_process,
    open_program, open_file, manage_window
]

AVAILABLE_TOOLS = {t.name: t for t in TOOLS}
