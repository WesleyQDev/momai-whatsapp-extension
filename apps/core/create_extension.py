import os
import json
import sys
from pathlib import Path

def create_extension(name: str):
    # Converte Nome Para ID (slug)
    ext_id = name.lower().replace(" ", "_")
    
    # Caminho base (assume execução na raiz do projeto ou em apps/core)
    base_path = Path("apps/core/agents/extensions") / ext_id
    
    if base_path.exists():
        print(f"Error: Extension {ext_id} already exists at {base_path}")
        return

    base_path.mkdir(parents=True)
    
    # 1. Create manifest.json
    manifest = {
        "id": f"com.momai.extension.{ext_id}",
        "name": name,
        "author": "Your Name",
        "version": "0.1.0",
        "description": f"Description for {name}",
        "icon": "Puzzle",
        "entry": "plugin.py",
        "system_prompt": f"You are the {name} specialist. Your goal is to help the user with specialized tasks.",
        "intents": [
            f"Usar a extensão {name}",
            f"Peça ajuda ao {name}"
        ],
        "features": {
            "sidebar": False,
            "agent_name": ext_id
        }
    }
    
    with open(base_path / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # 2. Create plugin.py
    plugin_content = f"""from services.extensions.hooks import hookimpl
from langchain_core.tools import tool
from typing import List

class {name.replace(" ", "")}Plugin:
    @hookimpl
    def register_tools(self):
        \"\"\"
        Return a list of tools for this extension.
        \"\"\"
        return [self.example_tool]

    @tool
    def example_tool(self, query: str):
        \"\"\"An example tool for {name}.\"\"\"
        return f"Result for {{query}} from {name}"

    @hookimpl
    def on_startup(self):
        print(f"[{{self.manifest.name}}] Initialized!")

# To use the Class-based system, the manager needs to instantiate it.
# For now, let's export the hooks as global functions for compatibility.

plugin = {name.replace(" ", "")}Plugin()

@hookimpl
def register_tools():
    return plugin.register_tools()

@hookimpl
def on_startup():
    plugin.on_startup()
"""
    # Wait, the Class-based system is better. I'll stick to a simpler version first
    # that works with the current manager.py
    
    simple_plugin = f"""from services.extensions.hooks import hookimpl
from langchain_core.tools import tool
from typing import List

@tool
def {ext_id}_tool(param: str):
    \"\"\"Describe what this tool does here.\"\"\"
    return f"Extensão {name} processou: {{param}}"

@hookimpl
def register_tools():
    \"\"\"Registra as ferramentas no sistema.\"\"\"
    return [{ext_id}_tool]

@hookimpl
def on_startup():
    \"\"\"Executado ao iniciar o sistema.\"\"\"
    print("Extensão {name} carregada com sucesso!")
"""

    with open(base_path / "plugin.py", "w", encoding="utf-8") as f:
        f.write(simple_plugin)

    # 3. Create pyproject.toml
    pyproject_content = f"""[project]
name = "{ext_id}"
version = "0.1.0"
description = "Extension {name} for MomAI"
dependencies = []
"""
    with open(base_path / "pyproject.toml", "w", encoding="utf-8") as f:
        f.write(pyproject_content)

    print(f"Success! Extension {name} created at {base_path}")
    print(f"To test: Restart MomAI and the extension will be loaded automatically.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_extension.py 'My Extension Name'")
    else:
        create_extension(sys.argv[1])
