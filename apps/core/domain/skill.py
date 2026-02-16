import os
import sys
import yaml
import importlib.util
import logging
from typing import List, Any, Optional, Dict
from pydantic import BaseModel

logger = logging.getLogger("momai.skills")


class Skill(BaseModel):
    """
    A Skill defined via Markdown + YAML frontmatter.
    Supports lazy loading of instructions and tools.
    """

    id: str
    file_path: str
    name: str
    description: str
    license: Optional[str] = None
    allowed_tools: List[str] = []
    metadata: Dict[str, Any] = {}

    # These are loaded only when needed
    full_instructions: Optional[str] = None
    loaded: bool = False
    _tools: Optional[List[Any]] = None

    @classmethod
    def from_file(cls, skill_id: str, path: str) -> "Skill":
        """Loads only the metadata from the Markdown file (Lazy)."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"Skill file not found: {path}")

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        # Extract YAML frontmatter
        if not content.startswith("---"):
            raise ValueError(
                f"Invalid skill format in {path}: Missing YAML frontmatter."
            )

        parts = content.split("---", 2)
        if len(parts) < 3:
            raise ValueError(
                f"Invalid skill format in {path}: Incomplete YAML frontmatter."
            )

        header = yaml.safe_load(parts[1])

        return cls(
            id=skill_id,
            file_path=path,
            name=header.get("name", skill_id),
            description=header.get("description", ""),
            license=header.get("license"),
            allowed_tools=header.get("allowed-tools", "").split(", ")
            if isinstance(header.get("allowed-tools"), str)
            else header.get("allowed-tools", []),
            metadata=header.get("metadata", {}),
        )

    def load_full_content(self):
        """Loads the Markdown instructions and prepares the skill for execution."""
        if self.loaded:
            return

        with open(self.file_path, "r", encoding="utf-8") as f:
            content = f.read()

        parts = content.split("---", 2)
        if len(parts) >= 3:
            self.full_instructions = parts[2].strip()

        self.loaded = True

    def load_tools(self) -> List[Any]:
        """
        Loads tools from the skill's tools.py file.
        Returns a list of LangChain BaseTool objects.
        """
        if self._tools is not None:
            return self._tools

        self._tools = []

        skill_dir = os.path.dirname(self.file_path)
        tools_file = os.path.join(skill_dir, "tools.py")

        if not os.path.exists(tools_file):
            logger.info(
                f"[Skill {self.id}] No tools.py found, using allowed_tools from manifest"
            )
            return self._tools

        try:
            spec = importlib.util.spec_from_file_location(
                f"skill_{self.id}", tools_file
            )
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = module
                spec.loader.exec_module(module)

                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    from langchain_core.tools import BaseTool

                    if isinstance(attr, BaseTool):
                        self._tools.append(attr)
                    else:
                        # Debug: log what attributes exist
                        has_is_tool = hasattr(attr, "_is_tool")
                        has_call = hasattr(attr, "__call__")
                        has_name = hasattr(attr, "name")
                        if has_call and has_name:
                            logger.debug(
                                f"[Skill {self.id}] Found callable {attr_name}: _is_tool={has_is_tool}, name={getattr(attr, 'name', None)}"
                            )

                logger.info(
                    f"[Skill {self.id}] Loaded {len(self._tools)} tools from tools.py"
                )
            else:
                logger.warning(f"[Skill {self.id}] Could not load tools.py spec")

        except Exception as e:
            logger.error(f"[Skill {self.id}] Error loading tools.py: {e}")

        return self._tools

    def get_tools(self) -> List[Any]:
        """Returns the skill's tools, loading them if necessary."""
        if self._tools is None:
            return self.load_tools()
        return self._tools

    def get_context_injection(self) -> str:
        """Returns the full skill instructions for prompt injection."""
        if not self.loaded:
            self.load_full_content()
        return f"\n\n{self.full_instructions}"

    def __hash__(self):
        return hash(self.id)

    def __eq__(self, other):
        if not isinstance(other, Skill):
            return False
        return self.id == other.id
