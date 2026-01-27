import operator
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field
from rich.console import Console
from services.extensions.manager import extension_manager

console = Console(force_terminal=True, legacy_windows=True)

def log_event(title: str, content: str, color: str = "magenta"):
    console.print(f"\n[bold {color}]>>> {title}[/bold {color}]")
    console.print(f" {content}")
    console.print("-" * 40)

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    next: str
    reasoning: bool

class Router(BaseModel):
    next: str = Field(description="The name of the specialist agent to handle the request.")

def get_valid_history(messages: Sequence[BaseMessage], limit: int) -> list[BaseMessage]:
    if not messages: return []
    slice_idx = max(0, len(messages) - limit)
    while slice_idx > 0 and isinstance(messages[slice_idx], ToolMessage): slice_idx -= 1
    return messages[slice_idx:]

def create_momai_graph(llm, user_name="Senhor", assistant_persona=None, checkpointer=None):
    from database.vector_db import vector_db

    async def semantic_router(state: AgentState):
        """Roteamento dinâmico via LanceDB."""
        last_msg = state["messages"][-1].content
        log_event("Semantic Router", f"Query: {last_msg}", "magenta")
        
        try:
            results = await vector_db.search_intent(last_msg, limit=1)
            if results:
                match = results[0]
                distance = match.get("_distance", 1.0)
                if distance < 0.6:
                    target = match["agent"]
                    console.print(f"[bold green]✔ Match:[/bold green] [yellow]{target}[/yellow]")
                    return {"next": target}
        except Exception as e:
            console.print(f"[red]Router Error:[/red] {e}")
            
        return {"next": "mom_orchestrator"}

    async def mom_orchestrator(state: AgentState):
        """Orquestrador estratégico (LLM) como fallback."""
        log_event("Strategic Orchestrator", "Analyzing intent...", "blue")
        
        # Gera a lista de agentes disponíveis dinamicamente para o prompt do roteador
        manifests = extension_manager.get_active_manifests()
        agent_descriptions = "\n".join([f"- `{m['features']['agent_name']}`: {m['description']}" for m in manifests])

        prompt = ChatPromptTemplate.from_messages([
            ("system", f"Route the request to the best specialist.\nAvailable specialists:\n{agent_descriptions}\n- `responder`: General chat/greeting.\nPick ONE."),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        try:
            chain = prompt | llm.with_structured_output(Router)
            response = await chain.ainvoke({"messages": get_valid_history(state["messages"], 6)})
            return {"next": response.next}
        except:
            return {"next": "responder"}

    async def specialist_node(state: AgentState):
        """Nó Universal do Microkernel: Carrega prompt e ferramentas do PluginRegistry."""
        agent_name = state["next"]
        console.print(f"[bold cyan]Specialist Active:[/bold cyan] {agent_name}")
        
        manifest = extension_manager.get_agent_manifest(agent_name)
        if not manifest:
            # Fallback para o responder se o agente não existir
            return {"next": "responder"}

        # Tool RAG: Busca ferramentas relevantes no banco de vetores
        from tools.system_actions import get_all_tools_registry
        last_msg = state["messages"][-1].content
        tool_results = await vector_db.search_tools(last_msg, limit=10)
        all_registry = get_all_tools_registry()
        
        active_tools = []
        for t_data in tool_results:
            t_name = t_data["name"]
            if t_name in all_registry:
                active_tools.append(all_registry[t_name])

        prompt = ChatPromptTemplate.from_messages([
            ("system", manifest.system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        chain = prompt | llm.bind_tools(active_tools) if active_tools else prompt | llm
        result = await chain.ainvoke({"messages": get_valid_history(state["messages"], 10)})
        
        if isinstance(result, BaseMessage): result.name = agent_name
        return {"messages": [result]}

    async def responder_node(state: AgentState):
        """Nó final de personalidade e voz."""
        manifest = extension_manager.get_agent_manifest("responder")
        system_prompt = manifest.system_prompt if manifest else "You are MomAI. Respond in Portuguese."
        
        if assistant_persona:
            system_prompt = f"# PERSONA\n{assistant_persona}\n\n{system_prompt}"

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        # O responder sempre tem acesso a algumas ferramentas de UI
        from tools.system_actions import AVAILABLE_TOOLS
        basic_tools = [AVAILABLE_TOOLS[t] for t in ["show_graph", "close_graph", "open_model_selector"] if t in AVAILABLE_TOOLS]
        
        chain = prompt | llm.bind_tools(basic_tools) if basic_tools else prompt | llm
        result = await chain.ainvoke({"messages": get_valid_history(state["messages"], 12)})
        result.name = "MomAgent"
        return {"messages": [result]}

    workflow = StateGraph(AgentState)
    
    workflow.add_node("specialist_node", specialist_node)
    workflow.add_node("semantic_router", semantic_router)
    workflow.add_node("mom_orchestrator", mom_orchestrator)
    workflow.add_node("responder", responder_node)

    from langgraph.prebuilt import ToolNode
    from tools.system_actions import get_all_tools_list
    workflow.add_node("tools", ToolNode(get_all_tools_list()))
    
    workflow.set_entry_point("semantic_router")

    def router_condition(state: AgentState):
        if state["next"] == "mom_orchestrator": return "mom_orchestrator"
        if state["next"] == "responder": return "responder"
        return "specialist_node"

    workflow.add_conditional_edges("semantic_router", router_condition)
    workflow.add_conditional_edges("mom_orchestrator", lambda x: "responder" if x["next"] == "responder" else "specialist_node")

    def after_specialist_condition(state: AgentState):
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "tools"
        return "responder"

    workflow.add_conditional_edges("specialist_node", after_specialist_condition)
    workflow.add_edge("tools", "responder")
    
    workflow.add_conditional_edges("responder", 
        lambda x: "tools" if hasattr(x["messages"][-1], "tool_calls") and x["messages"][-1].tool_calls else "end",
        {"tools": "tools", "end": END}
    )

    return workflow.compile(checkpointer=checkpointer)