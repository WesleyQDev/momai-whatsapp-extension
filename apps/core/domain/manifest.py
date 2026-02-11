from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import re

class AgentFeatures(BaseModel):
    sidebar: bool = False
    agent_name: str
    ui_view: Optional[str] = "ChatDashboard"
    ui_schema: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    safe_tools: List[str] = Field(default_factory=list)  # Tools that don't require user confirmation

class Permissions(BaseModel):
    # List of specific permissions allowed for the extension
    network: bool = False
    filesystem: bool = False
    system_actions: bool = False
    shell: bool = False
    user_data: bool = False

class Manifest(BaseModel):
    id: str = Field(..., description="Unique ID (e.g., com.momai.extension.name)")
    name: str = Field(..., min_length=3)
    author: str
    version: str = Field(..., description="Semantic versioning (0.1.0)")
    description: str
    icon: Optional[str] = "Puzzle"
    entry: str = "plugin.py"
    system_prompt: Optional[str] = "You are a specialized assistant."
    intents: List[str] = Field(default_factory=list)
    features: AgentFeatures
    permissions: Permissions = Field(default_factory=Permissions)

    @validator("id")
    def validate_id(cls, v):
        if not re.match(r"^[a-z0-9._]+$", v):
            raise ValueError("ID must contain only lowercase, numbers, dots and underscores.")
        return v
    
    @validator("version")
    def validate_version(cls, v):
        if not re.match(r"^\d+\.\d+\.\d+$", v):
            raise ValueError("Version must follow semantic versioning (x.y.z)")
        return v

    class Config:
        frozen = True
