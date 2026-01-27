import pluggy
from typing import List, Dict, Any, Optional
from langchain_core.tools import BaseTool

hookspec = pluggy.HookspecMarker("momai")
hookimpl = pluggy.HookimplMarker("momai")

class ExtensionSpec:
    """
    Especificação dos Hooks que as extensões do MomAI podem implementar.
    Use o decorador @hookimpl em sua extensão para implementar estes métodos.
    """

    @hookspec
    def register_tools(self) -> List[BaseTool]:
        """
        Retorna uma lista de ferramentas (LangChain Tools) que a extensão oferece.
        Essas ferramentas ficarão disponíveis para todos os agentes se forem relevantes semanticamente.
        """

    @hookspec
    def register_sidebar_items(self) -> List[Dict[str, Any]]:
        """
        Retorna itens para a barra lateral do frontend.
        Formato esperado: [{
            "id": "meu_plugin_view", 
            "icon": "LayoutDashboard", # Lucide Icon Name
            "label": "Meu Plugin", 
            "view": "MyCustomView" # Nome do componente Vue/React no frontend
        }]
        """

    @hookspec
    def on_agent_init(self, agent_name: str) -> Optional[str]:
        """
        Chamado antes de cada execução de um agente especialista.
        Permite customizar o prompt de sistema programaticamente com base no contexto.
        Retorno: Novo System Prompt (string) ou None para usar o padrão do manifest.
        """

    @hookspec
    def on_startup(self) -> None:
        """
        Chamado uma única vez quando a extensão é carregada durante a inicialização do MomAI.
        Ideal para inicializar bancos de dados, conexões ou carregar modelos pesados.
        """
