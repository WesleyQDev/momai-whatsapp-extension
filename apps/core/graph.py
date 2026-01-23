import operator
from typing import Annotated, Sequence, TypedDict, Literal

from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from agents import get_agents, MOM_PROMPT
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

# Definição do Estado


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    next: str


class Router(BaseModel):
    """Escolhe o próximo especialista ou decide que é hora de responder ao usuário."""
    next: Literal["SearchAgent", "SystemAgent", "InterfaceAgent", "responder"] = Field(
        description="O próximo especialista a ser consultado ou 'responder' se já temos a informação ou se é apenas uma conversa."
    )


def create_momai_graph(llm):
    agents = get_agents(llm)

    # --- NÓS (NODES) ---

    async def mom_orchestrator(state: AgentState):
        """O cérebro da MomAI que decide quem deve agir."""

        # O orquestrador usa o MOM_PROMPT para entender o contexto e delegar
        orchestrator_prompt = ChatPromptTemplate.from_messages([
            ("system", MOM_PROMPT),
            MessagesPlaceholder(variable_name="messages"),
            ("system", "Who should act now? Consider the experts’ tools. If it’s just conversation or if the technical task has ended, choose 'respond''."),
        ])

        chain = orchestrator_prompt | llm.with_structured_output(Router)
        try:
            response = await chain.ainvoke(state)
            return {"next": response.next}
        except Exception as e:
            print(f"[MomAgent] Erro no roteamento: {e}. Indo para responder.")
            return {"next": "responder"}

    async def agent_node(state: AgentState, agent, name):
        """Executa um especialista."""
        result = await agent.ainvoke(state)
        # Se o agente não retornou ToolMessage/AIMessage com tool_calls, garantimos o formato
        if not isinstance(result, BaseMessage):
            result = HumanMessage(content=str(result), name=name)
        return {"messages": [result]}

    async def responder_node(state: AgentState):
        """O nó final que dá a resposta amigável 'Senhor' ao usuário."""
        # O responder usa o MomAgent (persona principal) que possui ferramentas de diálogo e interface
        result = await agents["MomAgent"].ainvoke(state)
        return {"messages": [result]}

    # --- CONSTRUÇÃO DO GRAFO ---

    workflow = StateGraph(AgentState)

    # Adiciona os especialistas de forma assíncrona correta
    async def search_node(state: AgentState):
        return await agent_node(state, agents["SearchAgent"], "SearchAgent")

    async def system_node(state: AgentState):
        return await agent_node(state, agents["SystemAgent"], "SystemAgent")

    async def interface_node(state: AgentState):
        return await agent_node(state, agents["InterfaceAgent"], "InterfaceAgent")

    workflow.add_node("SearchAgent", search_node)
    workflow.add_node("SystemAgent", system_node)
    workflow.add_node("InterfaceAgent", interface_node)

    # Adiciona o Orquestrador e o Respondedor
    workflow.add_node("mom_orchestrator", mom_orchestrator)
    workflow.add_node("responder", responder_node)

    # Ferramentas compartilhadas
    from langgraph.prebuilt import ToolNode
    from tools import TOOLS
    tool_node = ToolNode(TOOLS)
    workflow.add_node("tools", tool_node)

    # --- ARESTAS (EDGES) ---

    # Todos voltam para o orquestrador para ele decidir o próximo passo
    workflow.add_edge("SearchAgent", "mom_orchestrator")
    workflow.add_edge("SystemAgent", "mom_orchestrator")
    workflow.add_edge("InterfaceAgent", "mom_orchestrator")
    workflow.add_edge("tools", "mom_orchestrator")

    # Aresta condicional do Orquestrador
    workflow.add_conditional_edges(
        "mom_orchestrator",
        lambda x: x["next"],
        {
            "SearchAgent": "SearchAgent",
            "SystemAgent": "SystemAgent",
            "InterfaceAgent": "InterfaceAgent",
            "responder": "responder"
        }
    )

    # Lógica de tools para os trabalhadores e para a Gerente
    def should_continue(state: AgentState):
        messages = state["messages"]
        last_message = messages[-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "continue"

    workflow.add_conditional_edges("SearchAgent", should_continue, {
                                   "tools": "tools", "continue": "mom_orchestrator"})
    workflow.add_conditional_edges("SystemAgent", should_continue, {
                                   "tools": "tools", "continue": "mom_orchestrator"})
    workflow.add_conditional_edges("InterfaceAgent", should_continue, {
                                   "tools": "tools", "continue": "mom_orchestrator"})

    # O responder (Gerente) também pode disparar ferramentas (ex: confirmações)
    workflow.add_conditional_edges("responder", should_continue, {
        "tools": "tools",
        "continue": END
    })

    workflow.set_entry_point("mom_orchestrator")

    return workflow.compile()
