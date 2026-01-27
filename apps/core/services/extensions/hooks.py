import pluggy
from typing import List, Dict, Any, Optional
from langchain_core.tools import BaseTool

hookspec = pluggy.HookspecMarker("momai")
hookimpl = pluggy.HookimplMarker("momai")

class ExtensionSpec:
    """
    Especificação dos Hooks que as extensões do MomAI podem implementar.
    """

    @hookspec
    def register_tools(self) -> List[BaseTool]:
        """
        Retorna uma lista de ferramentas (LangChain Tools) que a extensão oferece.
        """

    @hookspec
    def register_sidebar_items(self) -> List[Dict[str, Any]]:
        """
        Retorna itens para a barra lateral do frontend.
        Formato: [{"id": "...", "icon": "...", "label": "...", "view": "..."}]
        """

    @hookspec
    def on_agent_init(self, agent_name: str) -> Optional[str]:
        """
        Permite customizar o prompt de sistema de um agente específico.
        """

    @hookspec
    def on_startup(self) -> None:
        """
        Chamado quando a extensão é carregada durante a inicialização do MomAI.
        """
