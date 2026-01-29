from services.extensions.hooks import hookimpl
from langchain_core.tools import tool
from typing import List

@tool
def env_test_tool(param: str):
    """Describe what this tool does here."""
    return f"Env Test processou: {param}"

@hookimpl
def register_tools():
    """Register tools in the system."""
    return [env_test_tool]

@hookimpl
def on_startup():
    """Executed when the system starts."""
    print("Env Test extension loaded successfully!")
