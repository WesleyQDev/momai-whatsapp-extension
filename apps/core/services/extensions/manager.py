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
                            
                            # Support for Class-based plugins:
                            # If the module has an 'initialize' function, we call it and register the instance.
                            # Otherwise, we register the module itself (global functions approach).
                            if hasattr(module, "initialize"):
                                plugin_instance = module.initialize(manifest)
                                self.pm.register(plugin_instance)
                                self.plugins[plugin_id]["instance"] = plugin_instance
                                print(f"[Registry] Initialized class-based plugin: {manifest.id}")
                            else:
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


    def get_agent_init_prompts(self, agent_name: str) -> List[str]:
        """Returns prompt additions from extensions, with a direct-call fallback."""
        prompts: List[str] = []
        try:
            hook_results = self.pm.hook.on_agent_init(agent_name=agent_name)
            if hook_results:
                for item in hook_results:
                    if item:
                        prompts.append(item)
        except Exception as e:
            print(f"[Registry] Error collecting on_agent_init hooks: {e}")

        if prompts:
            return prompts

        # Fallback: direct call on plugin objects if hook registration failed
        for plugin_id, p_info in self.plugins.items():
            if not p_info["enabled"]:
                continue
            plugin_obj = p_info.get("instance") or p_info.get("module")
            if not plugin_obj:
                continue
            handler = getattr(plugin_obj, "on_agent_init", None)
            if not callable(handler):
                continue
            try:
                result = handler(agent_name)
                if result:
                    prompts.append(result)
            except Exception as e:
                print(f"[Registry] Error in on_agent_init for {plugin_id}: {e}")

        return prompts


    def get_tools(self) -> List[Any]:
        """Collect tools registered via hooks with permission validation."""
        from utils.safe_tools import SafeExtensionTool
        all_tools = []
        
        # Iterate over each registered plugin to apply specific constraints
        for plugin_id, p_info in self.plugins.items():
            if not p_info["enabled"]:
                continue

            plugin_obj = p_info.get("instance") or p_info.get("module")
            if not plugin_obj:
                continue
            
            # Use pluggy to call the hook FOR THIS SPECIFIC PLUGIN
            # This allows us to attribute tools to their origin
            try:
                # pm.subset_hook_caller returns a caller that only calls specific plugins
                hook_caller = self.pm.subset_hook_caller("register_tools", [plugin_obj])
                results = hook_caller()

                if not results or all(r is None for r in results):
                    handler = getattr(plugin_obj, "register_tools", None)
                    if callable(handler):
                        try:
                            direct_result = handler()
                            results = [direct_result]
                        except Exception as e:
                            print(f"[Registry] Direct register_tools error in {plugin_id}: {e}")
                
                if results:
                    manifest = p_info["manifest"]
                    for tool_list in results:
                        if not tool_list: continue
                        for t in tool_list:
                            # Wrap for safety and attach origin for permission checks later
                            safe_tool = SafeExtensionTool(original_tool=t, manifest=manifest)
                            all_tools.append(safe_tool)
            except Exception as e:
                print(f"[Registry] Error getting tools from {plugin_id}: {e}")
                
        return all_tools

    def resolve_tool_shortcut(self, agent_name: str, user_text: str) -> Optional[Dict[str, Any]]:
        """Asks extensions for a direct tool call based on the user text."""
        for plugin_id, p_info in self.plugins.items():
            if not p_info.get("enabled"):
                continue

            plugin_obj = p_info.get("instance") or p_info.get("module")
            if not plugin_obj:
                continue

            try:
                hook_caller = self.pm.subset_hook_caller("resolve_tool_shortcut", [plugin_obj])
                results = hook_caller(agent_name=agent_name, user_text=user_text)

                if not results or all(r is None for r in results):
                    handler = getattr(plugin_obj, "resolve_tool_shortcut", None)
                    if callable(handler):
                        try:
                            results = [handler(agent_name, user_text)]
                        except Exception as e:
                            print(f"[Registry] Direct resolve_tool_shortcut error in {plugin_id}: {e}")

                if results:
                    for item in results:
                        if item:
                            return item
            except Exception as e:
                print(f"[Registry] Error resolving shortcut in {plugin_id}: {e}")

        return None

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

    def enable_extension(self, extension_id: str) -> bool:
        """Enables an extension and calls lifecycle hooks."""
        if extension_id not in self.plugins:
            return False
        
        plugin = self.plugins[extension_id]
        if plugin["enabled"]:
            return True

        from database.models import SessionLocal, Extension
        db = SessionLocal()
        try:
            ext_record = db.query(Extension).filter(Extension.id == extension_id).first()
            if not ext_record:
                ext_record = Extension(id=extension_id, is_enabled=True, is_builtin=(plugin["category"] == "builtin"))
                db.add(ext_record)
            else:
                ext_record.is_enabled = True
            db.commit()
            
            # Reload plugin code
            self._load_plugin(plugin["path"], plugin["category"])
            
            # Call Hooks
            if self.plugins[extension_id]["module"]:
                self.pm.hook.on_enable()
                self.pm.hook.on_startup()
            
            return True
        except Exception as e:
            print(f"[Registry] Error enabling {extension_id}: {e}")
            return False
        finally:
            db.close()

    def disable_extension(self, extension_id: str) -> bool:
        """Disables an extension and calls lifecycle hooks. Builtins cannot be disabled."""
        if extension_id not in self.plugins:
            return False
        
        plugin = self.plugins[extension_id]
        
        if plugin["category"] == "builtin":
            print(f"[Registry] Blocked attempt to disable core extension: {extension_id}")
            return False

        if not plugin["enabled"]:
            return True

        from database.models import SessionLocal, Extension
        db = SessionLocal()
        try:
            ext_record = db.query(Extension).filter(Extension.id == extension_id).first()
            if ext_record:
                ext_record.is_enabled = False
                db.commit()
            
            # Call Hook before disabling
            self.pm.hook.on_disable()
            
            # Unregister both module and instance
            if plugin["module"]:
                self.pm.unregister(plugin["module"])
            
            if plugin.get("instance"):
                self.pm.unregister(plugin["instance"])
                plugin["instance"] = None
            
            plugin["enabled"] = False
            plugin["module"] = None
            
            return True
        except Exception as e:
            print(f"[Registry] Error disabling {extension_id}: {e}")
            return False
        finally:
            db.close()

    def uninstall_extension(self, extension_id: str) -> bool:
        """Uninstalls an extension, calls lifecycle hooks and removes files."""
        if extension_id not in self.plugins:
            return False
            
        plugin = self.plugins[extension_id]
        if plugin["category"] == "builtin":
            print(f"[Registry] Cannot uninstall builtin extension: {extension_id}")
            return False

        # 1. Disable first
        self.disable_extension(extension_id)

        # 2. Call Uninstall Hook (we might need to reload it temporarily to call the hook if it was disabled)
        # For now, if it was just disabled, the module might still be in sys.modules or we can reload it.
        # But usually on_uninstall is for cleaning up db/files.
        if plugin["module"]:
             self.pm.hook.on_uninstall()

        # 3. Remove from DB
        from database.models import SessionLocal, Extension
        db = SessionLocal()
        try:
            db.query(Extension).filter(Extension.id == extension_id).delete()
            db.commit()
            
            # 4. Remove Files
            import shutil
            if plugin["path"].exists():
                shutil.rmtree(plugin["path"])
            
            # 5. Remove from registry
            del self.plugins[extension_id]
            
            return True
        except Exception as e:
            print(f"[Registry] Error uninstalling {extension_id}: {e}")
            return False
        finally:
            db.close()

    async def dispatch_action(self, extension_id: str, action: str, payload: Optional[Dict[str, Any]] = None):
        """Dispatches an action from the UI to a specific extension."""
        if extension_id not in self.plugins:
            return {"status": "error", "message": "Extension not found"}
        
        plugin = self.plugins[extension_id]
        if not plugin.get("enabled"):
            return {"status": "error", "message": "Extension is disabled"}
        
        instance = plugin.get("instance")
        module = plugin.get("module")
        
        target = instance if instance else module
        
        if hasattr(target, "handle_ui_action"):
            try:
                # Handle both sync and async handlers
                import asyncio
                handler = getattr(target, "handle_ui_action")
                if asyncio.iscoroutinefunction(handler):
                    return await handler(action, payload)
                else:
                    return handler(action, payload)
            except Exception as e:
                print(f"[Registry] Action error in {extension_id}: {e}")
                return {"status": "error", "message": str(e)}
        
        return {"status": "error", "message": "Extension does not support UI actions"}

    async def sync_indexes(self, db):
        """Syncs all enabled tools and agents to the Vector DB using the optimized indexer."""
        from utils.indexer import index_all_system_tools, index_initial_intents
        await index_all_system_tools()
        await index_initial_intents()
# Singleton instance
extension_manager = PluginRegistry()