import subprocess
import os
import json
from pathlib import Path

from langchain_core.tools import tool
from services.extensions.hooks import hookimpl
from pydantic import BaseModel, Field

class LaunchAppInput(BaseModel):
    app_name: str = Field(description="Name or partial name of the application to open.")

class AppLauncher:
    def __init__(self, manifest):
        self.manifest = manifest
        # Caminho para salvar os dados da extensão
        self.data_file = Path(os.path.dirname(__file__)) / "apps.json"
        self.apps = self._load_apps()

    def _load_apps(self):
        if self.data_file.exists():
            try:
                with open(self.data_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except:
                return []
        return []

    def _save_apps(self):
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(self.apps, f, indent=2)

    @hookimpl
    def register_tools(self):
        """Oferece ferramentas para o Agente usar via chat"""
        
        # Store reference to self for the closure
        launcher = self
        
        @tool(args_schema=LaunchAppInput)
        def open_registered_app(app_name: str):
            """Opens an application that was previously added to the launcher list by its name."""
            # Reload apps from file dynamically to ensure fresh data
            apps = launcher._load_apps()
            
            query = app_name.lower()
            # Procura por nome ou caminho
            match = None
            for app in apps:
                if query in app["name"].lower() or query in app["path"].lower():
                    match = app
                    break
            
            if match:
                try:
                    os.startfile(match["path"])
                    return f"OK: Opening {match['name']} ({match['path']})"
                except Exception as e:
                    return f"Error: Failed to open {match['name']}. {str(e)}"
            
            return f"Error: App '{app_name}' not found in the launcher list. Available: {', '.join([a['name'] for a in apps])}"

        return [open_registered_app]

    @hookimpl
    def on_agent_init(self, agent_name: str):
        """Injects the list of available apps into the system prompt when this agent or the orchestrator is running."""
        # Only inject if it's the AppLauncher specialist or the orchestrator needs to know
        if agent_name in ["app_launcher", "mom_orchestrator", "responder"]:
            # Reload apps from file dynamically to ensure fresh data
            apps = self._load_apps()
            
            if not apps:
                return "No apps registered in the launcher yet. Tell the user they can add apps using the 'App Launcher' interface in the sidebar."
            
            app_names = ", ".join([a["name"] for a in apps])
            return (
                "Apps registrados no App Launcher: "
                f"{app_names}. "
                "Se o usuario pedir para abrir um desses apps (mesmo por nome parcial), "
                "chame obrigatoriamente a ferramenta 'open_registered_app' com o nome. "
                "Nao sugira a Store quando o app estiver registrado."
            )
        return None

    @hookimpl
    def resolve_tool_shortcut(self, agent_name: str, user_text: str):
        if agent_name != "app_launcher":
            return None

        query = (user_text or "").lower()
        if not query:
            return None

        apps = self._load_apps()
        for app in apps:
            name = str(app.get("name", "")).lower()
            path = str(app.get("path", "")).lower()
            if (name and name in query) or (path and path in query):
                return {"name": "open_registered_app", "args": {"app_name": app.get("name", "")}}

        return None

    def handle_ui_action(self, action, payload):
        """Lida com as interações vindas da interface React"""

        if action == "add_app":
            path = (payload.get("new_path") or payload.get("value") or "").strip()
            name = (payload.get("new_name") or "").strip()

            # Remove aspas se o usuario colou com elas
            path = path.replace('"', '').replace("'", "")

            if not path:
                return {"status": "error", "message": "Informe o caminho do app.", "apps": self.apps}

            if not os.path.exists(path):
                return {
                    "status": "error",
                    "message": "Caminho invalido ou nao encontrado.",
                    "apps": self.apps
                }

            # Se for um diretorio ou executavel valido
            resolved_name = name or (os.path.basename(path) or path)
            app_id = str(hash(path))

            # Evita duplicados
            if any(a["path"] == path for a in self.apps):
                return {"status": "error", "message": "App ja cadastrado.", "apps": self.apps}

            self.apps.append({
                "id": app_id,
                "name": resolved_name,
                "path": path,
                "subtitle": path
            })
            self._save_apps()
            return {"status": "ok", "message": "App adicionado.", "apps": self.apps}

        if action in ["remove_app", "delete_app"]:
            app_id = payload.get("id")
            self.apps = [a for a in self.apps if str(a["id"]) != str(app_id)]
            self._save_apps()
            return {"apps": self.apps}

        if action == "open_app":
            app_id = payload.get("id")
            match = next((a for a in self.apps if str(a["id"]) == str(app_id)), None)
            if not match:
                return {"status": "error", "message": "App nao encontrado.", "apps": self.apps}
            try:
                os.startfile(match["path"])
                return {"status": "ok", "message": f"Abrindo {match['name']}."}
            except Exception as e:
                return {"status": "error", "message": f"Falha ao abrir: {e}"}

        if action == "prefill_edit":
            app_id = payload.get("id")
            match = next((a for a in self.apps if str(a["id"]) == str(app_id)), None)
            if not match:
                return {"status": "error", "message": "App nao encontrado.", "apps": self.apps}
            return {
                "inputs": {
                    "edit_id": str(match["id"]),
                    "edit_name": match.get("name", ""),
                    "edit_path": match.get("path", "")
                }
            }

        if action == "update_app":
            app_id = payload.get("edit_id") or payload.get("id")
            new_name = (payload.get("edit_name") or "").strip()
            new_path = (payload.get("edit_path") or "").strip()

            match = next((a for a in self.apps if str(a["id"]) == str(app_id)), None)
            if not match:
                return {"status": "error", "message": "App nao encontrado.", "apps": self.apps}

            if new_path:
                cleaned_path = new_path.replace('"', '').replace("'", "")
                if not os.path.exists(cleaned_path):
                    return {
                        "status": "error",
                        "message": "Novo caminho invalido.",
                        "apps": self.apps
                    }
                match["path"] = cleaned_path
                match["subtitle"] = cleaned_path
            if new_name:
                match["name"] = new_name

            self._save_apps()
            return {"status": "ok", "message": "App atualizado.", "apps": self.apps}

        if action == "launch_all":
            for app in self.apps:
                try:
                    # No Windows, 'start' lida bem com caminhos
                    os.startfile(app["path"])
                except Exception as e:
                    print(f"Erro ao abrir {app['path']}: {e}")
            return {"status": "success"}

        # Caso precise apenas carregar a lista inicial
        if action == "get_initial_state":
               return {"apps": self.apps}

def initialize(manifest):
    return AppLauncher(manifest)
