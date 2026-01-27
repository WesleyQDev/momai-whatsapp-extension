from services.extensions.hooks import hookimpl
from langchain_core.tools import tool
from typing import List

@tool
def env_test_tool(param: str):
    """Describe what this tool does here."""
    return f"Extensão Env Test processou: {param}"

@hookimpl
def register_tools():
    """Registra as ferramentas no sistema."""
    return [env_test_tool]

@hookimpl
def on_startup():
    """Executado ao iniciar o sistema."""
    print("Extensão Env Test carregada com sucesso!")
