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
    plugin_content = f"""from services.extensions.base import MomAIExtension
from services.extensions.hooks import hookimpl
from langchain_core.tools import tool
from typing import List

class {name.replace(" ", "")}Plugin(MomAIExtension):
    @hookimpl
    def register_tools(self):
        \"\"\"
        Registra as ferramentas no sistema.
        \"\"\"
        return [{ext_id}_tool]

    @hookimpl
    def on_startup(self):
        \"\"\"Executado ao carregar a extens\u00e3o no boot.\"\"\"
        print(f"[{name}] Inicializada!")

    @hookimpl
    def on_enable(self):
        \"\"\"Executado quando a extens\u00e3o \u00e9 ativada pelo usu\u00e1rio.\"\"\"
        print(f"[{name}] Habilitada!")

@tool
def {ext_id}_tool(param: str):
    \"\"\"Descreva o que esta ferramenta faz aqui.\"\"\"
    return f"Extens\u00e3o {name} processou: {{param}}"

def initialize(manifest):
    \"\"\"Ponto de entrada para inicializar a classe da extens\u00e3o.\"\"\"
    return {name.replace(" ", "")}Plugin(manifest)
"""

    with open(base_path / "plugin.py", "w", encoding="utf-8") as f:
        f.write(plugin_content)

    # 3. Create pyproject.toml for dependency management
    pyproject = f"""[project]
name = "{ext_id}"
version = "0.1.0"
description = "Description for {name}"
authors = [{{ name = "Your Name" }}]
dependencies = []

[build-system]
requires = ["setuptools", "wheel"]
build-backend = "setuptools.build_meta"
"""
    with open(base_path / "pyproject.toml", "w", encoding="utf-8") as f:
        f.write(pyproject)

    print(f"Extension {name} created successfully at {base_path}")
    print(f"ID: com.momai.extension.{ext_id}")
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
