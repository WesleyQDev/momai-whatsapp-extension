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

    status = f"**CPU:** {cpu_usage}% | **RAM:** {mem.percent}%\n\n(`{round(mem.used/1024**3, 1)}GB` utilizados de `{round(mem.total/1024**3, 1)}GB`)"
    if battery:
        status += f"\n\n**Bateria:** {battery.percent}% {'(Carregando ⚡)' if battery.power_plugged else '(Descarregando)'}"

    # Side View Graph
    show_graph.invoke({
        "view": "side",
        "content": f"# Status do Sistema\n\n{status}",
        "options": [],
        "bypass_wake_word": False
    })

    return f"Relatório de status exibido na lateral. Resumo: CPU {cpu_usage}%, RAM {mem.percent}%."


class SystemControlInput(BaseModel):
    command: Literal['volume_up', 'volume_down', 'mute', 'lock_screen'] = Field(description="O comando de sistema a ser executado.")

@tool(args_schema=SystemControlInput)
def system_control(command: Literal['volume_up', 'volume_down', 'mute', 'lock_screen']):
    """
    Executa comandos de controle do sistema operacional Windows (Volume, Bloqueio de Tela).
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


class SearchFilesystemInput(BaseModel):
    query: str = Field(description="O padrão de busca (ex: '*.pdf', 'relatorio', '*'). Use '*' para listar tudo.")
    search_type: Literal['file', 'folder', 'both'] = Field(default='both', description="Filtrar por 'file' (arquivo), 'folder' (pasta) ou 'both' (ambos).")
    location_alias: str = Field(default="common", description="Alias da pasta alvo: 'docs', 'desktop', 'downloads', 'pics', 'common' ou 'home'.")

@tool(args_schema=SearchFilesystemInput)
def search_filesystem(query: str, search_type: Literal['file', 'folder', 'both'] = 'both', location_alias: str = "common") -> str:
    """
    Pesquisa arquivos ou lista conteúdos de pastas no sistema de arquivos do Windows (suporta OneDrive).
    Use para encontrar documentos, imagens ou verificar arquivos do usuário.
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


class ShowGraphInput(BaseModel):
    view: Literal['center', 'side'] = Field(description="'center' para diálogos/decisões (modal). 'side' para informações/status (lateral).")
    content: str = Field(description="Conteúdo em Markdown a ser exibido.")
    options: List[str] = Field(default=[], description="Lista de opções (botões) para o usuário escolher.")
    ui_schema: Dict[str, Any] = Field(default=None, description="Schema JSON para UI dinâmica (DynamicRenderer).")
    bypass_wake_word: bool = Field(default=False, description="Se True, ativa o microfone imediatamente após exibir.")

@tool(args_schema=ShowGraphInput)
def show_graph(view: Literal['center', 'side'], content: str, options: list[str] = None, ui_schema: dict = None, bypass_wake_word: bool = False):
    """
    Exibe uma interface gráfica rica (UI) para o usuário.
    Use 'center' para pedir confirmações ou escolhas importantes.
    Use 'side' para mostrar dados, status ou relatórios sem bloquear a tela.
    """
    import main
    import asyncio

    if options is None:
        options = []

    # Atualiza estado no backend
    main.set_graph_state(view, bypass_wake_word)

    payload = {
        "type": "graph_open",
        "data": {
            "view": view,
            "content": content,
            "options": options,
            "ui_schema": ui_schema,
            "bypass_wake_word": bypass_wake_word
        }
    }

    if main.main_loop:
        asyncio.run_coroutine_threadsafe(
            main.broadcast_to_sockets(payload), main.main_loop)

    return f"Interface '{view}' aberta. O usuário está vendo o conteúdo."


@tool
def close_graph():
    """Fecha qualquer interface gráfica aberta e reativa o Wake Word."""
    import main
    import asyncio

    main.set_graph_state(None, False)

    payload = {"type": "graph_close"}

    if main.main_loop:
        asyncio.run_coroutine_threadsafe(
            main.broadcast_to_sockets(payload), main.main_loop)

    return "Interface fechada."


@tool
def ask_confirmation(message: str, options: list[str] = None):
    """
    Exibe dialog de confirmação (Graph Center).
    OBRIGATÓRIO: Use para escolhas do usuário.
    """
    if options is None:
        options = ["Sim", "Não"]

    return show_graph.invoke({
        "view": "center",
        "content": f"### Confirmação Necessária\n\n{message}",
        "options": options,
        "bypass_wake_word": True
    })


@tool
def open_model_selector():
    """
    Abre o seletor de modelos de IA (Graph Center).
    Use quando o usuário pedir para trocar de modelo ou "mudar cerebro".
    """
    return show_graph.invoke({
        "view": "center",
        "content": "### Selecione o Modelo de IA\n\nEscolha qual 'cérebro' devo utilizar.\n\n- **Local:** Mais privacidade, offline.\n- **Groq:** Mais inteligente, requer internet.\n- **Gemini:** Multimodal, Google AI.",
        "options": ["Local", "Groq", "Gemini"],
        "bypass_wake_word": True
    })


@tool
def switch_ai_model(mode: Literal['local', 'groq', 'gemini']):
    """Troca o modelo de IA. Apenas execute isso DEPOIS que o usuário escolher no seletor."""
    import AI_core
    import main
    import asyncio

    try:
        # Feedback visual antes de começar (para evitar sensação de travamento)
        show_graph.invoke({
            "view": "center",
            "content": f"### 🔄 Trocando para {mode.title()}...\n\nPor favor, aguarde enquanto configuro o novo modelo.",
            "options": [],
            "bypass_wake_word": True
        })

        AI_core.initialize_llm(mode)

        # Fecha o gráfico após escolha bem sucedida
        close_graph.invoke({})

        payload = {
            "type": "model_changed",
            "data": {"new_mode": mode}
        }
        if main.main_loop:
            asyncio.run_coroutine_threadsafe(
                main.broadcast_to_sockets(payload), main.main_loop)

        return f"Modelo alterado com sucesso para {mode}, Senhor."
    except Exception as e:
        return f"Erro ao trocar para o modelo {mode}: {str(e)}"


# Export
TOOLS = [
    get_current_time, get_system_stats, system_control,
    search_filesystem, open_browser, manage_process,
    open_program, open_file, manage_window,
    show_graph, close_graph, ask_confirmation, open_model_selector, switch_ai_model
]

AVAILABLE_TOOLS = {t.name: t for t in TOOLS}
