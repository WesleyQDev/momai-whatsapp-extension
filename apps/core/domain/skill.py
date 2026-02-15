import os
import yaml
from typing import List, Any, Optional, Dict
from pydantic import BaseModel

class Skill(BaseModel):
    """
    A Skill defined via Markdown + YAML frontmatter.
    Supports lazy loading of instructions and tools.
    """
    id: str
    file_path: str
    name: str
    description: str
    allowed_tools: List[str] = []
    metadata: Dict[str, Any] = {}
    
    # These are loaded only when needed
    full_instructions: Optional[str] = None
    loaded: bool = False

    @classmethod
    def from_file(cls, skill_id: str, path: str) -> "Skill":
        """Loads only the metadata from the Markdown file (Lazy)."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"Skill file not found: {path}")
            
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Extract YAML frontmatter
        if not content.startswith("---"):
            raise ValueError(f"Invalid skill format in {path}: Missing YAML frontmatter.")
            
        parts = content.split("---", 2)
        if len(parts) < 3:
            raise ValueError(f"Invalid skill format in {path}: Incomplete YAML frontmatter.")
            
        header = yaml.safe_load(parts[1])
        
        return cls(
            id=skill_id,
            file_path=path,
            name=header.get("name", skill_id),
            description=header.get("description", ""),
            allowed_tools=header.get("allowed-tools", "").split(", ") if isinstance(header.get("allowed-tools"), str) else header.get("allowed-tools", []),
            metadata=header.get("metadata", {})
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
