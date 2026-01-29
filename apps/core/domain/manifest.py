from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class AgentFeatures(BaseModel):
    sidebar: bool = False
    agent_name: str
    ui_view: Optional[str] = "ChatDashboard"
    ui_schema: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)



class Manifest(BaseModel):
    id: str
    name: str
    author: str
    version: str
    description: str
    icon: Optional[str] = "Puzzle"
    entry: str = "plugin.py"
    system_prompt: Optional[str] = "You are a specialized assistant."
    intents: List[str] = Field(default_factory=list)
    features: AgentFeatures
    permissions: Optional[Dict[str, List[str]]] = Field(default_factory=dict)

    class Config:
        frozen = True
