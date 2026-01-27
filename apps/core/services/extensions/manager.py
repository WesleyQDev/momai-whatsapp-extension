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
        """Descobre e carrega todos os plugins das pastas configuradas."""
        print("[Microkernel] Discovering agents and extensions...")
        self.plugins.clear()
        
        for category, base_path in self.base_dirs.items():
            if not base_path.exists():
                continue
            
            for plugin_dir in base_path.iterdir():
                if plugin_dir.is_dir():
                    self._load_plugin(plugin_dir, category)
        
        print(f"[Microkernel] {len(self.plugins)} plugins registered.")
        self.pm.hook.on_startup()

    def _load_plugin(self, path: Path, category: str):
        manifest_path = path / "manifest.json"
        if not manifest_path.exists():
            return

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                raw_manifest = json.load(f)
            
            manifest = Manifest(**raw_manifest)
            
            # Check DB status
            from database.models import SessionLocal, Extension
            db = SessionLocal()
            ext_state = db.query(Extension).filter(Extension.id == manifest.id).first()
            
            is_builtin = category == "builtin"
            
            if not ext_state:
                # Builtins are enabled by default, others start disabled for safety
                enabled = True if is_builtin else False
                ext_state = Extension(id=manifest.id, is_enabled=enabled, is_builtin=is_builtin)
                db.add(ext_state)
                db.commit()
                db.refresh(ext_state)
            
            is_enabled = ext_state.is_enabled
            db.close()

            module = None
            if is_enabled:
                entry_path = path / manifest.entry
                if entry_path.exists():
                    # Dynamic Import
                    spec = importlib.util.spec_from_file_location(manifest.id, str(entry_path))
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[manifest.id] = module
                    spec.loader.exec_module(module)
                    self.pm.register(module)

            self.plugins[manifest.id] = {
                "manifest": manifest,
                "module": module,
                "category": category,
                "path": path,
                "enabled": is_enabled
            }
            
            status_str = "Active" if is_enabled else "Disabled"
            print(f"[Registry] {status_str} {category}: {manifest.name} ({manifest.id})")
            
        except Exception as e:
            print(f"[Registry] Error loading {path.name}: {e}")

    def get_agent_manifest(self, agent_name: str) -> Optional[Manifest]:
        """Busca o manifesto pelo nome do agente (ex: SearchAgent)."""
        for p in self.plugins.values():
            if p["enabled"] and p["manifest"].features.agent_name == agent_name:
                return p["manifest"]
        return None

    def get_tools(self) -> List[Any]:
        """Coleta ferramentas registradas via hooks."""
        all_tools = []
        results = self.pm.hook.register_tools()
        if results:
            for tool_list in results:
                if tool_list: all_tools.extend(tool_list)
        return all_tools

    def get_active_manifests(self) -> List[Dict]:
        """Retorna manifestos formatados para o Frontend com status."""
        result = []
        for p in self.plugins.values():
            m_dict = p["manifest"].dict()
            m_dict["enabled"] = p["enabled"]
            m_dict["category"] = p["category"]
            result.append(m_dict)
        return result

# Singleton instance
extension_manager = PluginRegistry()