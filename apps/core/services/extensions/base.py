from typing import List, Dict, Any, Optional
from langchain_core.tools import BaseTool
from .hooks import hookimpl

class MomAIExtension:
    """
    Classe base para facilitar o desenvolvimento de extensões do MomAI.
    Ao herdar desta classe, você tem acesso facilitado aos hooks e utilitários.
    
    Exemplo:
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
