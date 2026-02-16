import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
from domain.skill import Skill


class SkillRegistry:
    def __init__(self):
        self.base_dirs = {
            "builtin": Path(__file__).parent.parent.parent / "skills",
            "extensions": Path(__file__).parent.parent.parent / "skills_extensions",
            "user": self._get_user_extensions_dir(),
        }

        self.skills: Dict[str, Dict[str, Any]] = {}
        self._skill_tools: Dict[str, Any] = {}
        self._ensure_dirs()

    def _get_user_extensions_dir(self) -> Path:
        if sys.platform == "win32":
            base = Path(os.path.expandvars("%APPDATA%")) / "MomAI"
        else:
            base = Path.home() / ".local" / "share" / "MomAI"
        return base / "skills_extensions"

    def _ensure_dirs(self):
        for d in self.base_dirs.values():
            d.mkdir(parents=True, exist_ok=True)

    def load_all(self):
        """Discovers and loads all skills from configured directories."""
        print("[SkillRegistry] Discovering skills...")

        self.skills.clear()
        self._skill_tools.clear()

        for category, base_path in self.base_dirs.items():
            try:
                if not base_path.exists():
                    continue

                for skill_dir in base_path.iterdir():
                    try:
                        if skill_dir.is_dir():
                            self._load_skill(skill_dir, category)
                    except Exception as e:
                        print(f"[SkillRegistry] Error at {skill_dir}: {e}")
            except Exception as e:
                print(f"[SkillRegistry] Error scanning {category}: {e}")

        print(f"[SkillRegistry] {len(self.skills)} skills loaded.")
        self._invalidate_tools_cache()

    def _load_skill(self, path: Path, category: str):
        """Loads a skill from skill.md."""
        skill_id = path.name

        skill_path = None
        for filename in ["SKILL.md", "skill.md"]:
            potential = path / filename
            if potential.exists():
                skill_path = potential
                break

        if not skill_path:
            return

        self.skills[skill_id] = {
            "id": skill_id,
            "category": category,
            "path": path,
            "skill_path": str(skill_path),
            "enabled": True,
            "error": None,
        }

        try:
            skill = Skill.from_file(skill_id, str(skill_path))
            self.skills[skill_id]["name"] = skill.name
            self.skills[skill_id]["description"] = skill.description
            print(f"[SkillRegistry] Loaded: {skill.name} ({category})")
        except Exception as e:
            self.skills[skill_id]["error"] = str(e)
            print(f"[SkillRegistry] Error loading {skill_id}: {e}")

    def _invalidate_tools_cache(self) -> None:
        try:
            from tools.system_actions import invalidate_tools_registry_cache

            invalidate_tools_registry_cache()
        except Exception:
            pass

    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """Retrieves a skill by name or ID."""
        from tools.system_actions import invalidate_tools_registry_cache
        from utils.safe_tools import SafeExtensionTool

        for s_id, s_info in self.skills.items():
            if not s_info.get("enabled"):
                continue

            if s_id == skill_id or s_info.get("name") == skill_id:
                skill_path = s_info.get("skill_path")
                if not skill_path:
                    continue

                try:
                    skill = Skill.from_file(s_id, skill_path)

                    skill_tools = skill.load_tools()
                    if skill_tools:
                        for tool in skill_tools:
                            safe_tool = SafeExtensionTool(original_tool=tool)
                            self._skill_tools[safe_tool.name] = safe_tool
                        invalidate_tools_registry_cache()

                    return skill
                except Exception as e:
                    print(f"[SkillRegistry] Error loading skill {skill_id}: {e}")
                    return None

        return None

    def get_all_skills(self) -> List[Dict]:
        """Returns all loaded skills."""
        result = []
        for s in self.skills.values():
            result.append(
                {
                    "id": s.get("id", "unknown"),
                    "name": s.get("name", s["path"].name),
                    "description": s.get("description", ""),
                    "category": s.get("category", "unknown"),
                    "enabled": s.get("enabled", False),
                }
            )
        return result

    def get_tools(self) -> List[Any]:
        """Returns all skill tools."""
        return list(self._skill_tools.values())


skill_registry = SkillRegistry()
extension_manager = skill_registry
