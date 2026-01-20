from langchain_core.tools import tool
from datetime import datetime
import platform
import os
import subprocess
from langchain_community.tools import DuckDuckGoSearchRun
from typing import List
import pygetwindow as gw

# Instância do buscador
search = DuckDuckGoSearchRun()


# Variável global para rastrear o modo do LLM (atualizada pelo AI_core)
current_mode = "local"
version = "0.0.0"


@tool
def get_current_time():
    """Retorna a hora atual no formato HH:MM."""
    return datetime.now().strftime("%H:%M")


@tool
def get_system_info():
    """Retorna informações sobre o sistema operacional."""
    return


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


@tool
def about_momai():
    """Retorna informações brutas a serem tratadas pelo LLM sobre o projeto MomAI, versão, modo atual do LLM e sistema operacional."""
    return f"""
**MomAI {version}**, \n
Estou usando o **{current_mode}** no momento.\n
sistema operacional **{platform.system()} {platform.release()} ({platform.version()})**\n"""


@tool
def list_installed_apps() -> List[str]:
    """
    Rastreia e retorna o nome de todos os aplicativos e programas 
    instalados no Windows que possuem interface gráfica ou registro.
    """
    # Comando PowerShell para buscar aplicativos instalados no registro
    cmd = 'powershell "Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName | Where-Object { $_.DisplayName -ne $null }"'

    try:
        output = subprocess.check_output(
            cmd, shell=True).decode('utf-8', errors='ignore')
        # Limpa a saída para retornar apenas os nomes
        apps = [line.strip() for line in output.split('\r\n') if line.strip()
                and "DisplayName" not in line and "----" not in line]
        return sorted(list(set(apps)))  # Remove duplicatas e ordena
    except Exception as e:
        return [f"Erro ao listar apps: {str(e)}"]


@tool
def manage_app_window(app_name: str, action: str) -> str:
    """
    Gerencia o estado de um aplicativo no Windows.
    Args:
        app_name: Nome do aplicativo ou título da janela (ex: 'Chrome', 'Notepad').
        action: Ação a ser executada: 'open', 'close', 'minimize' ou 'maximize'.
    """
    action = action.lower()

    if action == "open":
        try:
            # Tenta abrir via comando de execução do Windows (funciona para apps comuns)
            subprocess.Popen(f"start {app_name}", shell=True)
            return f"Comando para abrir '{app_name}' enviado."
        except Exception as e:
            return f"Erro ao abrir {app_name}: {str(e)}"

    # Localiza janelas que contenham o nome fornecido
    windows = gw.getWindowsWithTitle(app_name)

    if not windows:
        return f"Nenhuma janela aberta encontrada com o nome '{app_name}'."

    target_window = windows[0]  # Pega a primeira correspondência

    try:
        if action == "minimize":
            target_window.minimize()
            return f"Janela '{app_name}' minimizada."

        elif action == "maximize":
            target_window.maximize()
            target_window.activate()  # Traz para frente ao maximizar
            return f"Janela '{app_name}' maximizada."

        elif action == "close":
            target_window.close()
            return f"Janela '{app_name}' fechada."

        else:
            return "Ação inválida. Use 'open', 'close', 'minimize' ou 'maximize'."

    except Exception as e:
        return f"Falha ao executar {action} em {app_name}: {str(e)}"


# Exemplo de como carregar as ferramentas para um Agente LangChain
# tools = [list_installed_apps, manage_app_window]
# Lista exportada de ferramentas para facilitar a importação
TOOLS = [get_current_time, get_system_info,
         web_search, open_fortnite, about_momai, list_installed_apps, manage_app_window]
AVAILABLE_TOOLS = {t.name: t for t in TOOLS}
