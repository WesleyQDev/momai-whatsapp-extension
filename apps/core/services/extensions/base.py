from typing import List, Dict, Any, Optional
from langchain_core.tools import BaseTool
from .hooks import hookimpl

class MomAIExtension:
    """
    Base class for facilitating the development of MomAI extensions.
    By inheriting from this class, you gain access to hooks and utilities.
    
    Example:
    class MyExtension(MomAIExtension):
        @hookimpl
        def register_tools(self):
            return [MyTool()]
    """
    
    def __init__(self, manifest: Any):
        self.manifest = manifest

    @hookimpl
    def register_tools(self) -> List[BaseTool]:
        return []

    @hookimpl
    def register_sidebar_items(self) -> List[Dict[str, Any]]:
        return []

    @hookimpl
    def on_agent_init(self, agent_name: str) -> Optional[str]:
        return None

    @hookimpl
    def on_startup(self) -> None:
        pass
