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
    def on_startup(self):
        """Called when MomAI boots and the extension is enabled."""
        pass

    @hookimpl
    def on_enable(self):
        """Called when the user enables the extension."""
        pass

    @hookimpl
    def on_disable(self):
        """Called before the extension is disabled."""
        pass

    @hookimpl
    def on_install(self):
        """Called immediately after installation."""
        pass

    @hookimpl
    def on_uninstall(self):
        """Called before files are removed."""
        pass

    @hookimpl
    def on_startup(self) -> None:
        pass
