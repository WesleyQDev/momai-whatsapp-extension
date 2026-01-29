import operator
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field
from services.extensions.manager import extension_manager

import logging
logger = logging.getLogger("momai.graph")

def log_event(title: str, content: str, color: str = ""):
    """Log via standard logging to ensure visibility in Electron terminal."""
    logger.info(f">>> [{title}] {content}")

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    next: str
    reasoning: bool

class Router(BaseModel):
    next: str = Field(description="The name of the specialist agent to handle the request.")

def get_valid_history(messages: Sequence[BaseMessage], limit: int) -> list[BaseMessage]:
    if not messages: return []
    # Filter empty messages that could confuse the model (no content and no tool_calls)
    clean_messages = [
        m for m in messages 
        if (m.content and str(m.content).strip()) or (hasattr(m, "tool_calls") and m.tool_calls)
    ]
    slice_idx = max(0, len(clean_messages) - limit)
    while slice_idx > 0 and isinstance(clean_messages[slice_idx], ToolMessage): slice_idx -= 1
    return clean_messages[slice_idx:]

def create_momai_graph(llm, user_name="Sir", assistant_persona=None, checkpointer=None):
    from database.vector_db import vector_db

    async def semantic_router(state: AgentState):
        """Dynamic routing via LanceDB."""
        last_msg = state["messages"][-1].content
        log_event("Semantic Router", f"Query: {last_msg}", "magenta")
        
        try:
            results = await vector_db.search_intent(last_msg, limit=1)
            if results:
                match = results[0]
                distance = match.get("_distance", 1.0)
                if distance < 0.6:
                    target = match["agent"]
                    logger.info(f"[Router] Match found: {target}")
                    return {"next": target}
        except Exception as e:
            logger.error(f"[Router] Error: {e}")
            
        return {"next": "mom_orchestrator"}

    async def mom_orchestrator(state: AgentState):
        """Strategic orchestrator (LLM) as fallback."""
        log_event("Strategic Orchestrator", "Analyzing intent...", "blue")
        
        # Generate the list of available agents dynamically for the router prompt
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
        """Universal Node of the Microkernel: Loads prompt and tools from PluginRegistry."""
        agent_name = state["next"]
        # If returning from tools, the agent name is preserved in state, or we infer it.
        # However, 'next' might be overwritten if we are in a loop.
        # For simplicity in this architecture, we assume 'next' holds the active agent.
        
        logger.info(f"--- Active Agent: {agent_name} ---")
        
        manifest = extension_manager.get_agent_manifest(agent_name)
        if not manifest:
            # Fallback for responder if the agent doesn't exist
            return {"next": "responder"}

        # Tool RAG: Search relevant tools in the vector database
        from tools.system_actions import get_all_tools_registry
        last_msg = state["messages"][-1].content
        # We only search tools if the last message is from Human (new request) or if we are reasoning.
        # Ideally, tools are static per agent invocation, but RAG allows dynamic expansion.
        
        tool_results = await vector_db.search_tools(str(last_msg), limit=10)
        all_registry = get_all_tools_registry()
        
        active_tools = []
        
        # 1. Add tools from Manifest (High Priority)
        # Assuming manifest has a list of tool names strings in 'features.tools' (if any)
        # The current manifest schema has "features": {"tools": [...]}
        if manifest.features and hasattr(manifest.features, 'tools'):
             for t_name in manifest.features.tools:
                 if t_name in all_registry:
                    active_tools.append(all_registry[t_name])

        # 2. Add tools from RAG
        for t_data in tool_results:
            t_name = t_data["name"]
            if t_name in all_registry and t_name not in [t.name for t in active_tools]:
                active_tools.append(all_registry[t_name])
        
        # 3. Always include core system tools (Safeguard)
        from tools.system_actions import AVAILABLE_TOOLS
        core_tools_names = ["show_graph",  "close_graph"]
        for t_name in core_tools_names:
             if t_name in AVAILABLE_TOOLS and t_name not in [t.name for t in active_tools]:
                 active_tools.append(AVAILABLE_TOOLS[t_name])

        if active_tools:
            logger.info(f"[Specialist] Tools considered: {[t.name for t in active_tools]}")
        else:
            logger.info("[Specialist] No specific tools found via RAG/Manifest.")

        # Logic for Persona Injection
        system_prompt = manifest.system_prompt
        
        # Global Persona Injection (Replaces the old 'responder' logic)
        persona_instruction = (
            f"You are engaging with {user_name}. "
            f"If {assistant_persona}: # PERSONA\n{assistant_persona}\n"
            "CRITICAL: Keep your verbal response extremely SHORT and PUNCHY. One or two sentences maximum. Great for TTS."
        )
        
        # Merge prompts
        final_system_prompt = f"{persona_instruction}\n\n# AGENT INSTRUCTIONS\n{system_prompt}"

        # Dynamic prompt customization via hooks
        custom_prompts = extension_manager.pm.hook.on_agent_init(agent_name=agent_name)
        if custom_prompts:
            for cp in custom_prompts:
                if cp:
                    final_system_prompt += f"\n\n# EXTENSION\n{cp}"

        if not active_tools:
            final_system_prompt += "\n\nNOTICE: No specific tools were found via RAG for this request. If you cannot perform the action, explain politely."
        else:
            final_system_prompt += "\n\nTOOL PROTOCOL: You have tools bound to this session. If you need to perform a system action or display information, you MUST generate a 'tool_call' instead of just describing the action in text. Never simulate a tool result in the chat."

        prompt = ChatPromptTemplate.from_messages([
            ("system", final_system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        chain = prompt | llm.bind_tools(active_tools) if active_tools else prompt | llm
        
        # Invoke LLM
        # We need a longer context for ReAct loops
        result = await chain.ainvoke({"messages": get_valid_history(state["messages"], 15)})
        
        # Fallback to avoid empty model response
        if not result.content and not (hasattr(result, "tool_calls") and result.tool_calls):
            result.content = "I'm sorry, I couldn't find a specific tool to perform that action at the moment. How else can I help you?"

        if isinstance(result, BaseMessage): result.name = agent_name
        return {"messages": [result]}

    # Responder is now just a normal fallback agent, not a mandatory node.
    # We can handle it via the specialist_node logic if we treat 'responder' as just another agent name.
    # However, to keep it structurally simple, we can rely on the router sending 'responder' to 'specialist_node' 
    # IF the responder has a manifest.
    # Let's verify if 'responder' has a manifest. Yes, 'com.momai.builtin.responder'.
    
    workflow = StateGraph(AgentState)
    
    workflow.add_node("specialist_node", specialist_node)
    workflow.add_node("semantic_router", semantic_router)
    workflow.add_node("mom_orchestrator", mom_orchestrator)
    # workflow.add_node("responder", responder_node) # Removed mandatory responder node

    from langgraph.prebuilt import ToolNode
    from tools.system_actions import get_all_tools_list
    workflow.add_node("tools", ToolNode(get_all_tools_list()))
    
    workflow.set_entry_point("semantic_router")

    def router_condition(state: AgentState):
        if state["next"] == "mom_orchestrator": return "mom_orchestrator"
        # If next is 'responder', we treat it as a specialist now (since we unified the logic)
        return "specialist_node"

    workflow.add_conditional_edges("semantic_router", router_condition)
    
    # Orchestrator always delegates to specialist (which includes responder)
    workflow.add_conditional_edges("mom_orchestrator", lambda x: "specialist_node")

    def after_specialist_condition(state: AgentState):
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "tools"
        return END  # Direct exit if no tools called

    workflow.add_conditional_edges("specialist_node", after_specialist_condition)
    
    # Tools go back to specialist to interpret results (ReAct Loop)
    workflow.add_edge("tools", "specialist_node")
    
    return workflow.compile(checkpointer=checkpointer)