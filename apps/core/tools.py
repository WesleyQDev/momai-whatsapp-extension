from langchain_core.tools import tool
from datetime import datetime
import platform
import os
import subprocess
from langchain_community.tools import DuckDuckGoSearchRun

# Instância do buscador
search = DuckDuckGoSearchRun()


@tool
def get_current_time():
    """Retorna a hora atual no formato HH:MM."""
    return datetime.now().strftime("%H:%M")


@tool
def get_system_info():
    """Retorna informações sobre o sistema operacional."""
    return f"SO: {platform.system()} {platform.release()} ({platform.version()})"


@tool
def web_search(query: str):
    """Faz uma busca na internet para encontrar informações atualizadas ou notícias."""
    try:
        return search.run(query)
    except Exception as e:
        return f"Erro ao buscar na internet: {str(e)}"


@tool
def open_fortnite():
    """Abre o jogo Fortnite. Use esta ferramenta quando o usuário pedir para jogar ou abrir o Fortnite."""
    try:
        # Tenta abrir via URI scheme da Epic Games (comum para Fortnite)
        # O ID 'fortnite' costuma funcionar ou o link direto
        os.startfile(
            "com.epicgames.launcher://apps/fortnite?action=launch&silent=true")
        return "Comando enviado para abrir o Fortnite via Epic Games Launcher."
    except Exception as e:
        return f"Não foi possível abrir o Fortnite automaticamente: {str(e)}"


# Lista exportada de ferramentas para facilitar a importação
TOOLS = [get_current_time, get_system_info, web_search, open_fortnite]
AVAILABLE_TOOLS = {t.name: t for t in TOOLS}
