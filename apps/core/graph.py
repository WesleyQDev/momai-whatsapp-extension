import operator
from typing import Annotated, Sequence, TypedDict, Literal

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from agents import get_agents, MOM_PROMPT
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

# Definição do Estado


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    next: str


class Router(BaseModel):
    """Selects the next specialist or decides it's time to respond to the user."""
    next: Literal["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent", "responder"] = Field(
        description="The next specialist to be consulted or 'responder' if we already have the info or if it's just a conversation."
    )


def sanitize_message_history(messages: Sequence[BaseMessage]) -> list[BaseMessage]:
    """
    Sanitizes the history to avoid consecutive messages of the same type.
    
    Necessary for Gemini/Groq. Removes SystemMessages from the middle 
    of the history and ensures ToolMessages integrity.

    Args:
        messages (Sequence[BaseMessage]): The sequence of messages to sanitize.

    Returns:
        list[BaseMessage]: The sanitized list of messages.
    """
    if not messages:
        return []

    # 1. Filter SystemMessages from history (agents inject via prompt)
    # Also remove empty messages that might break Gemini
    filtered = []
    for m in messages:
        if isinstance(m, SystemMessage):
            continue
        if not m.content and not (isinstance(m, AIMessage) and m.tool_calls):
            continue
        filtered.append(m)
    
    if not filtered:
        return []

    sanitized = []
    for msg in filtered:
        if not sanitized:
            sanitized.append(msg)
            continue

        last_msg = sanitized[-1]
        
        # If messages are of the same type (e.g., two consecutive HumanMessages)
        # ONLY merge if NONE of them involve tool calls
        is_same_type = type(msg) == type(last_msg)
        has_tool_stuff = (
            (isinstance(msg, AIMessage) and msg.tool_calls) or 
            (isinstance(last_msg, AIMessage) and last_msg.tool_calls) or
            isinstance(msg, ToolMessage) or
            isinstance(last_msg, ToolMessage)
        )

        if is_same_type and not has_tool_stuff:
            # Merge content if it's a string
            if isinstance(msg.content, str) and isinstance(last_msg.content, str):
                new_content = last_msg.content + "\n\n" + msg.content
                if isinstance(msg, AIMessage):
                    sanitized[-1] = AIMessage(content=new_content)
                elif isinstance(msg, HumanMessage):
                    sanitized[-1] = HumanMessage(content=new_content)
            else:
                sanitized[-1] = msg
        else:
            # If the order is ToolMessage -> ToolMessage, some models complain.
            # But LangGraph usually handles this if they have different IDs.
            sanitized.append(msg)
            
    return sanitized


def get_valid_history(messages: Sequence[BaseMessage], limit: int) -> list[BaseMessage]:
    """
    Returns the last N messages, ensuring it doesn't start with an orphan ToolMessage.

    Args:
        messages (Sequence[BaseMessage]): Message history.
        limit (int): Maximum number of messages to return.

    Returns:
        list[BaseMessage]: Validated and sanitized history slice.
    """
    if not messages:
        return []
    
    # Get the initial slice
    slice_idx = max(0, len(messages) - limit)
    
    # If slice starts with a ToolMessage, go back until finding the corresponding AIMessage
    # This avoids the "Failed to call a function" error in Gemini/Groq
    while slice_idx > 0 and isinstance(messages[slice_idx], ToolMessage):
        slice_idx -= 1
        
    return sanitize_message_history(messages[slice_idx:])


def create_momai_graph(llm, user_name="Senhor", assistant_persona=None, checkpointer=None):
    """
    Creates and compiles the MomAI agent graph.

    Args:
        llm: The Language Model instance.
        user_name (str): User's name for addressing.
        assistant_persona (str, optional): Custom persona prompt.
        checkpointer (optional): LangGraph checkpointer for persistence.

    Returns:
        CompiledGraph: The compiled state graph.
    """
    agents = get_agents(llm, user_name, assistant_persona)

    # --- NODES ---

    async def mom_orchestrator(state: AgentState):
        """The brain of MomAI that decides the next step."""
        
        router_system_prompt = (
            f"You are the MomAI Router. The user name is {user_name}.\n"
            "Decide if we need more info from a specialist or if we can respond to the user.\n\n"
            "CRITICAL GUIDELINES:\n"
            "1. If the last message contains tool RESULTS (e.g., list of files found, status info, reminder set), choose 'responder' IMMEDIATELY.\n"
            "2. If the specialist already provided the requested information, choose 'responder'.\n"
            "3. Specialist nodes are for GETTING info. 'responder' is for TALKING to the user.\n"
            "4. NEVER call the same specialist twice in a row for the same request.\n\n"
            "Specialists:\n"
            "- 'SearchAgent': Web search and scraping.\n"
            "- 'SystemAgent': Files, processes, hardware.\n"
            "- 'InterfaceAgent': UI graphics and model switching.\n"
            "- 'SchedulerAgent': Reminders and alarms.\n"
            "- 'responder': Send final friendly response to the user."
        )

        orchestrator_prompt = ChatPromptTemplate.from_messages([
            ("system", router_system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ])

        chain = orchestrator_prompt | llm.with_structured_output(Router)
        try:
            # Safely sanitize the last messages for the router
            sanitized_messages = get_valid_history(state["messages"], 6)
            response = await chain.ainvoke({"messages": sanitized_messages})
            return {"next": response.next}
        except Exception as e:
            print(f"[MomOrchestrator] Routing error: {e}. Defaulting to responder.")
            return {"next": "responder"}

    async def agent_node(state: AgentState, agent, name):
        """Executes a specialist agent resiliently."""
        # Maintain safe history for the specialist
        messages = get_valid_history(state["messages"], 10)
        result = await agent.ainvoke({"messages": messages})
        
        # Ensure the return is an AIMessage with the agent's name
        if isinstance(result, BaseMessage):
            result.name = name
        else:
            result = AIMessage(content=str(result), name=name)
        
        return {"messages": [result]}

    async def responder_node(state: AgentState):
        """Final node that generates the friendly response."""
        # Responder node needs a bit more safe context
        messages = get_valid_history(state["messages"], 12)
        result = await agents["MomAgent"].ainvoke({"messages": messages})
        if isinstance(result, BaseMessage):
            result.name = "MomAgent"
        return {"messages": [result]}

    # --- GRAPH CONSTRUCTION ---

    workflow = StateGraph(AgentState)

    # Dynamic node definition
    for agent_name in ["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent"]:
        async def _node(state, name=agent_name):
            return await agent_node(state, agents[name], name)
        workflow.add_node(agent_name, _node)

    workflow.add_node("mom_orchestrator", mom_orchestrator)
    workflow.add_node("responder", responder_node)

    # Tools
    from langgraph.prebuilt import ToolNode
    from tools import TOOLS
    workflow.add_node("tools", ToolNode(TOOLS))

    # --- EDGES ---

    # Main flow: Orchestrator decides
    workflow.set_entry_point("mom_orchestrator")

    workflow.add_conditional_edges(
        "mom_orchestrator",
        lambda x: x["next"],
        {
            "SearchAgent": "SearchAgent",
            "SystemAgent": "SystemAgent",
            "InterfaceAgent": "InterfaceAgent",
            "SchedulerAgent": "SchedulerAgent",
            "responder": "responder"
        }
    )

    # Logic to decide if we should continue or stop
    def should_continue(state: AgentState):
        last_message = state["messages"][-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "continue"

    # Specialist agents always go back to orchestrator
    for node in ["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent"]:
        workflow.add_edge(node, "mom_orchestrator")

    def after_tools_condition(state: AgentState):
        """
        Decides where to go after tools.
        
        If the last message (before the tool result) came from 'responder', 
        we stop to avoid MomAgent talking again and duplicating the response.
        """
        if len(state["messages"]) >= 2:
            last_ai_msg = state["messages"][-2]
            if hasattr(last_ai_msg, "name") and last_ai_msg.name == "MomAgent":
                return "end"
        
        return "orchestrator"

    workflow.add_conditional_edges("tools", after_tools_condition, {
        "end": END,
        "orchestrator": "mom_orchestrator"
    })

    workflow.add_conditional_edges("responder", should_continue, {
        "tools": "tools",
        "continue": END
    })

    for node in ["SearchAgent", "SystemAgent", "InterfaceAgent", "SchedulerAgent"]:
        workflow.add_conditional_edges(node, should_continue, {
            "tools": "tools",
            "continue": "mom_orchestrator"
        })

    return workflow.compile(checkpointer=checkpointer)