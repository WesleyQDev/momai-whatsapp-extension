import os
import sys
import json
import importlib.util
import pluggy
from pathlib import Path
from typing import List, Dict, Any, Optional
from domain.manifest import Manifest
from .hooks import ExtensionSpec

class PluginRegistry:
    def __init__(self):
        self.pm = pluggy.PluginManager("momai")
        self.pm.add_hookspecs(ExtensionSpec)
        
        self.base_dirs = {
            "builtin": Path(__file__).parent.parent.parent / "agents" / "builtin",
            "extensions": Path(__file__).parent.parent.parent / "agents" / "extensions",
            "user": self._get_user_extensions_dir()
        }
        
        self.plugins: Dict[str, Dict[str, Any]] = {}
        self._ensure_dirs()

    def _get_user_extensions_dir(self) -> Path:
        """Retorna o diretório de extensões do usuário."""
        if sys.platform == "win32":
            base = Path(os.path.expandvars("%APPDATA%")) / "MomAI"
        else:
            base = Path.home() / ".local" / "share" / "MomAI"
        return base / "extensions"

    def _ensure_dirs(self):
        for d in self.base_dirs.values():
            d.mkdir(parents=True, exist_ok=True)

    def load_all(self):
        """Discovers and loads all plugins from the configured directories."""
        print("[Microkernel] Discovering agents and extensions...")
        
        # Unregister existing plugins to avoid "already registered" errors on reload
        for plugin in list(self.pm.get_plugins()):
            self.pm.unregister(plugin)
            
        self.plugins.clear()

        
        for category, base_path in self.base_dirs.items():
            try:
                if not base_path.exists():
                    continue
                
                for plugin_dir in base_path.iterdir():
                    try:
                        if plugin_dir.is_dir():
                            self._load_plugin(plugin_dir, category)
                    except Exception as e:
                        print(f"[Registry] Error at plugin {plugin_dir}: {e}")
            except Exception as e:
                print(f"[Registry] Error scanning category {category}: {e}")
        
        print(f"[Microkernel] {len(self.plugins)} plugins registered.")
        try:
            self.pm.hook.on_startup()
        except Exception as e:
            print(f"[Microkernel] Startup hooks failed: {e}")


    def _load_plugin(self, path: Path, category: str):
        plugin_id = path.name # Default ID if manifest fails
        manifest_path = path / "manifest.json"
        
        if not manifest_path.exists():
            return

        # Initialize with placeholder in case of total failure
        self.plugins[plugin_id] = {
            "id": plugin_id,
            "manifest": None,
            "module": None,
            "category": category,
            "path": path,
            "enabled": False,
            "error": "Initializing..."
        }


        try:
            # 1. Load Manifest
            with open(manifest_path, "r", encoding="utf-8") as f:
                raw_manifest = json.load(f)
            
            try:
                manifest = Manifest(**raw_manifest)
                plugin_id = manifest.id # Update to real ID
                # Ensure we transfer the placeholder to the new ID if it changed
                if plugin_id != path.name:
                    self.plugins[plugin_id] = self.plugins.pop(path.name)
                
                self.plugins[plugin_id]["id"] = plugin_id
                self.plugins[plugin_id]["manifest"] = manifest

            except Exception as me:
                self.plugins[plugin_id]["error"] = f"Manifest error: {me}"
                print(f"[Registry] Manifest invalid in {path.name}: {me}")
                return

            # 2. Check Database Status
            is_enabled = False
            try:
                from database.models import SessionLocal, Extension
                db = SessionLocal()
                ext_state = db.query(Extension).filter(Extension.id == manifest.id).first()
                
                is_builtin = category == "builtin"
                
                if not ext_state:
                    # Builtins are enabled by default, others start disabled for safety
                    is_enabled = True if is_builtin else False
                    ext_state = Extension(id=manifest.id, is_enabled=is_enabled, is_builtin=is_builtin)
                    db.add(ext_state)
                    db.commit()
                    db.refresh(ext_state)
                else:
                    is_enabled = ext_state.is_enabled
                db.close()
            except Exception as dbe:
                print(f"[Registry] Database error for {manifest.id}: {dbe}")
                is_enabled = (category == "builtin") # Fallback for builtins

            self.plugins[plugin_id]["enabled"] = is_enabled
            self.plugins[plugin_id]["error"] = None

            # 3. Load Module if enabled
            if is_enabled:
                try:
                    # 3.1. Add VENV site-packages to sys.path if it exists
                    venv_dir = path / ".venv"
                    if venv_dir.exists():
                        if sys.platform == "win32":
                            site_packages = venv_dir / "Lib" / "site-packages"
                        else:
                            # Tenta descobrir a pasta lib/python3.x/site-packages
                            lib_dir = venv_dir / "lib"
                            python_dirs = list(lib_dir.glob("python3.*"))
                            if python_dirs:
                                site_packages = python_dirs[0] / "site-packages"
                            else:
                                site_packages = None
                        
                        if site_packages and site_packages.exists():
                            sp_str = str(site_packages)
                            if sp_str not in sys.path:
                                sys.path.append(sp_str)
                                print(f"[Registry] Added isolated path: {sp_str}")

                    entry_path = path / manifest.entry
                    if entry_path.exists():
                        # Dynamic Import
                        spec = importlib.util.spec_from_file_location(manifest.id, str(entry_path))
                        if spec and spec.loader:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[manifest.id] = module
                            spec.loader.exec_module(module)
                            self.pm.register(module)
                            self.plugins[plugin_id]["module"] = module
                            print(f"[Registry] Loaded {manifest.name} ({category})")
                        else:
                            raise Exception("Could not create module spec")
                except Exception as module_err:
                    print(f"[Registry] Code error in {manifest.id}: {module_err}")
                    self.plugins[plugin_id]["error"] = f"Code Error: {module_err}"
                    self.plugins[plugin_id]["enabled"] = False 

        except Exception as e:
            print(f"[Registry] Critical error loading {path.name}: {e}")
            if plugin_id in self.plugins:
                self.plugins[plugin_id]["error"] = str(e)


    def get_agent_manifest(self, agent_name: str) -> Optional[Manifest]:
        """Busca o manifesto pelo nome do agente (ex: SearchAgent)."""
        for p in self.plugins.values():
            if p["enabled"] and p["manifest"] and p["manifest"].features.agent_name == agent_name:
                return p["manifest"]
        return None


    def get_tools(self) -> List[Any]:
        """Collect tools registered via hooks."""
        all_tools = []
        results = self.pm.hook.register_tools()
        if results:
            for tool_list in results:
                if tool_list: all_tools.extend(tool_list)
        return all_tools

    def get_active_manifests(self) -> List[Dict]:
        """Returns formatted manifests for the Frontend with status."""
        result = []
        for p in self.plugins.values():
            if p["manifest"]:
                m_dict = p["manifest"].dict()
            else:
                m_dict = {
                    "id": p.get("id", "unknown"),
                    "name": f"Error in {p['path'].name}",
                    "description": p.get("error", "Error loading manifest."),
                    "author": "System",
                    "version": "0.0.0",
                    "icon": "Puzzle",
                    "features": {"agent_name": "error", "sidebar": False}
                }
            m_dict["enabled"] = p["enabled"]
            m_dict["category"] = p["category"]
            m_dict["error"] = p.get("error")
            result.append(m_dict)
        return result

    async def sync_indexes(self, db):
        """Syncs all enabled tools and agents to the Vector DB."""
        print("[Registry] Syncing Vector DB...")
        
        tools_to_add = []
        intents_to_add = []
        
        # 1. Native Tools
        # We handle imports here to avoid circular deps
        from tools.system_actions import TOOLS
        
        for t in TOOLS:
            # We index ALL native tools so the specialist can find them via text search too
            tools_to_add.append({
                "name": t.name,
                "description": t.description or "",
                "metadata": json.dumps({"source": "native"})
            })

        # 2. Extensions
        tools = self.get_tools()
        for t in tools:
             tools_to_add.append({
                "name": t.name,
                "description": t.description or "",
                "metadata": json.dumps({"source": "extension"})
            })
            
        # 3. Agents (Intents)
        for p in self.plugins.values():
            if p["enabled"] and p["manifest"]:
                m = p["manifest"]
                intents_to_add.append({
                    "text": m.description, # "Agent that controls HUE lights"
                    "agent": m.features.agent_name
                })
        
        if tools_to_add:
            await db.add_tools(tools_to_add)
        
        if intents_to_add:
            await db.add_intents(intents_to_add)
            
        print(f"[Registry] Vector DB synced with {len(tools_to_add)} tools and {len(intents_to_add)} agents.")
# Singleton instance
extension_manager = PluginRegistry()