import pluggy
from typing import List, Dict, Any, Optional
from langchain_core.tools import BaseTool

hookspec = pluggy.HookspecMarker("momai")
hookimpl = pluggy.HookimplMarker("momai")

class ExtensionSpec:
    """
    Specification of the Hooks that MomAI extensions can implement.
    Use the @hookimpl decorator in your extension to implement these methods.
    """

    @hookspec
    def register_tools(self) -> List[BaseTool]:
        """
        Returns a list of tools (LangChain Tools) that the extension offers.
        These tools will be available to all agents if they are semantically relevant.
        """

    @hookspec
    def register_sidebar_items(self) -> List[Dict[str, Any]]:
        """
        Returns items for the frontend sidebar.
        Expected format: [{
            "id": "my_extension_view", 
            "icon": "LayoutDashboard", # Lucide Icon Name
            "label": "My Extension", 
            "view": "MyCustomView" # Name of the Vue/React component in the frontend
        }]
        """

    @hookspec
    def on_agent_init(self, agent_name: str) -> Optional[str]:
        """
        Called before each execution of a specialized agent.
        Allows customizing the system prompt programatically based on the context.
        Return: New System Prompt (string) or None to use the default from the manifest.
        """

    @hookspec
    def on_startup(self) -> None:
        """
        Called once when the extension is loaded during MomAI initialization.
        Use this for one-time initialization tasks like database setup or model loading.
        """

    @hookspec
    def on_enable(self) -> None:
        """
        Called when the extension is manually enabled.
        """

    @hookspec
    def on_disable(self) -> None:
        """
        Called when the extension is manually disabled.
        """

    @hookspec
    def on_install(self) -> None:
        """
        Called after the extension is downloaded and ready to be used.
        """

    @hookspec
    def on_uninstall(self) -> None:
        """
        Called before the extension is removed from the system.
        """
