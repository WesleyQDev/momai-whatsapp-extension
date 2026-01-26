import operator
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from ai.graph.nodes import get_agents
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    next: str
    reasoning: bool

class Router(BaseModel):
    next: Literal["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent", "responder"] = Field(description="Next specialist or responder")

from rich.console import Console
from rich.panel import Panel

console = Console()

class Router(BaseModel):
    next: Literal["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent", "responder"] = Field(
        description="Select the most appropriate specialist."
    )

def sanitize_message_history(messages: Sequence[BaseMessage]) -> list[BaseMessage]:
    if not messages: return []
    filtered = [m for m in messages if not isinstance(m, SystemMessage) and (m.content or (isinstance(m, AIMessage) and m.tool_calls))]
    sanitized = []
    for msg in filtered:
        if not sanitized:
            sanitized.append(msg)
            continue
        last_msg = sanitized[-1]
        if type(msg) == type(last_msg) and not ((isinstance(msg, AIMessage) and msg.tool_calls) or isinstance(msg, ToolMessage)):
            if isinstance(msg.content, str) and isinstance(last_msg.content, str):
                sanitized[-1] = type(msg)(content=last_msg.content + "\n\n" + msg.content)
            else: sanitized[-1] = msg
        else: sanitized.append(msg)
    return sanitized

def get_valid_history(messages: Sequence[BaseMessage], limit: int) -> list[BaseMessage]:
    if not messages: return []
    slice_idx = max(0, len(messages) - limit)
    while slice_idx > 0 and isinstance(messages[slice_idx], ToolMessage): slice_idx -= 1
    return sanitize_message_history(messages[slice_idx:])

def create_momai_graph(llm, user_name="Senhor", assistant_persona=None, checkpointer=None):
    agents = get_agents(llm, user_name, assistant_persona)

    async def mom_orchestrator(state: AgentState):
        console.print(Panel(f"[bold blue]MomAI Strategic Orchestrator[/bold blue]\n[dim]Analyzing user intent...[/dim]"))
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", f"""Route the request to the best specialist for user {user_name}.
- `SystemAgent`: Windows OS, apps, hardware, files, time.
- `SearchAgent`: Web search, news, weather.
- `SchedulerAgent`: Reminders, alarms.
- `InterfaceAgent`: MomAI UI/Settings only.
- `responder`: General chat/greeting.
Pick ONE."""),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        try:
            chain = prompt | llm.with_structured_output(Router)
            history = get_valid_history(state["messages"], 8)
            response = await chain.ainvoke({"messages": history})
            
            console.print(f"[bold green]Routing to:[/bold green] [yellow]{response.next}[/yellow]")
            return {"next": response.next, "reasoning": False}
        except Exception as e:
            console.print(f"[bold red]Orchestrator Error:[/bold red] {str(e)}")
            # Advanced Fallback
            last_msg = state["messages"][-1].content.lower()
            
            system_keywords = ["horas", "data", "sistema", "cpu", "ram", "arquivo", "pasta", "janela", "abra", "open", "inicie", "execute", "feche", "volume", "tocar"]
            search_keywords = ["pesquise", "google", "notícia", "clima", "tempo", "quem é", "o que é", "onde fica"]
            scheduler_keywords = ["lembre", "agende", "tarefa", "alarme", "avise"]
            interface_keywords = ["interface", "gráfico", "mude o modelo", "configurações", "tema"]

            if any(k in last_msg for k in system_keywords):
                decision = "SystemAgent"
            elif any(k in last_msg for k in search_keywords):
                decision = "SearchAgent"
            elif any(k in last_msg for k in scheduler_keywords):
                decision = "SchedulerAgent"
            elif any(k in last_msg for k in interface_keywords):
                decision = "InterfaceAgent"
            else:
                decision = "responder"
            
            console.print(f"[bold orange3]Fallback Routing:[/bold orange3] [yellow]{decision}[/yellow] (Keyword Match)")
            return {"next": decision, "reasoning": False}

    async def agent_node(state: AgentState, agent, name):
        console.print(f"[bold cyan]Specialist Active:[/bold cyan] {name}")
        result = await agent.ainvoke({"messages": get_valid_history(state["messages"], 10)})
        if isinstance(result, BaseMessage): result.name = name
        else: result = AIMessage(content=str(result), name=name)
        return {"messages": [result]}

    async def responder_node(state: AgentState):
        result = await agents["MomAgent"].ainvoke({"messages": get_valid_history(state["messages"], 12)})
        if isinstance(result, BaseMessage): result.name = "MomAgent"
        return {"messages": [result]}

    workflow = StateGraph(AgentState)
    
    # Nodes
    async def search_node(s): return await agent_node(s, agents["SearchAgent"], "SearchAgent")
    async def system_node(s): return await agent_node(s, agents["SystemAgent"], "SystemAgent")
    async def interface_node(s): return await agent_node(s, agents["InterfaceAgent"], "InterfaceAgent")
    async def scheduler_node(s): return await agent_node(s, agents["SchedulerAgent"], "SchedulerAgent")

    workflow.add_node("SearchAgent", search_node)
    workflow.add_node("SystemAgent", system_node)
    workflow.add_node("InterfaceAgent", interface_node)
    workflow.add_node("SchedulerAgent", scheduler_node)
    workflow.add_node("mom_orchestrator", mom_orchestrator)
    workflow.add_node("responder", responder_node)

    from langgraph.prebuilt import ToolNode
    from tools.system_actions import TOOLS
    workflow.add_node("tools", ToolNode(TOOLS))
    
    workflow.set_entry_point("mom_orchestrator")

    # Transitions
    workflow.add_conditional_edges("mom_orchestrator", lambda x: x["next"], {
        "SearchAgent": "SearchAgent",
        "SystemAgent": "SystemAgent",
        "InterfaceAgent": "InterfaceAgent",
        "SchedulerAgent": "SchedulerAgent",
        "responder": "responder"
    })

    def after_specialist_condition(state: AgentState):
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "tools"
        return "responder" # Specialist finished speaking, go straight to responder

    for n in ["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent"]:
        workflow.add_conditional_edges(n, after_specialist_condition, {
            "tools": "tools",
            "responder": "responder"
        })

    # After tools, always go to responder to give the final answer
    workflow.add_edge("tools", "responder")

    # Final response goes to END (unless it needs a tool, like show_graph)
    workflow.add_conditional_edges("responder", 
        lambda x: "tools" if hasattr(x["messages"][-1], "tool_calls") and x["messages"][-1].tool_calls else "end",
        {"tools": "tools", "end": END}
    )

    return workflow.compile(checkpointer=checkpointer)
