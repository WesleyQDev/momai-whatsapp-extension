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
    pending_tool_call: str | None # Tracks the tool waiting for approval

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

from ai.constants import (
    CORE_GLOBAL_TOOLS,
    PERSONA_INJECTION_TEMPLATE,
    TOOL_PROTOCOL,
    NO_TOOLS_WARNING,
    ROUTER_SYSTEM_TEMPLATE
)

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
                confidence = round((1 - distance) * 100, 1) # Convert distance to rough % confidence
                target = match["agent"]
                matched_text = match.get("text", "unknown intent")
                
                # Rich Log for Thinking Trace
                log_content = f"Matched intent: '{matched_text}' ({confidence}% confidence) -> Routing to {target}"
                log_event("Semantic Router", log_content, "magenta")
                
                # We can't easily return metadata to the stream from here without changing State,
                # so we rely on the logger which orchestrator reads, OR we update a scratchpad in state (cleaner).
                # For now, let's stick to logging which Orchestrator captures via 'on_chain_start' or we improve orchestrator logic.
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

        system_msg = ROUTER_SYSTEM_TEMPLATE.format(agent_descriptions=agent_descriptions)

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_msg),
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
        
        logger.info(f"--- Active Agent: {agent_name} ---")
        
        manifest = extension_manager.get_agent_manifest(agent_name)
        if not manifest:
            # Fallback for responder if the agent doesn't exist (Hallucination handling)
            logger.warning(f"[Specialist] Agent '{agent_name}' not found. Falling back to 'responder'.")
            agent_name = "responder"
            # Explicitly update state to reflect the fallback
            state["next"] = "responder" 
            manifest = extension_manager.get_agent_manifest("responder")
            
        if not manifest:
             # Critical fallback if even responder is missing
             return {"messages": [AIMessage(content="System Error: 'responder' agent is missing. Please check your installation.")]}

        # Tool RAG: Search relevant tools in the vector database
        from tools.system_actions import get_all_tools_registry
        last_msg = state["messages"][-1].content
        
        tool_results = await vector_db.search_tools(str(last_msg), limit=10)
        all_registry = get_all_tools_registry()
        
        active_tools = []
        
        # 1. Add tools from Manifest (High Priority)
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
        for t_name in CORE_GLOBAL_TOOLS:
             if t_name in AVAILABLE_TOOLS and t_name not in [t.name for t in active_tools]:
                 active_tools.append(AVAILABLE_TOOLS[t_name])

        if active_tools:
            logger.info(f"[Specialist] Tools considered: {[t.name for t in active_tools]}")
        else:
            logger.info("[Specialist] No specific tools found via RAG/Manifest.")

        # Logic for Persona Injection
        system_prompt = manifest.system_prompt
        
        # Inject Current Date/Time for scheduling accuracy
        from datetime import datetime
        now = datetime.now()
        current_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
        weekday = now.strftime("%A")
        time_context = f"CURRENT DATE/TIME: {current_time_str} ({weekday}). Use this as reference for any scheduling."
        
        # Global Persona Injection
        persona_instruction = PERSONA_INJECTION_TEMPLATE.format(
            user_name=user_name,
            assistant_persona=assistant_persona if assistant_persona else ""
        )
        
        # Merge prompts
        final_system_prompt = f"{time_context}\n\n{persona_instruction}\n\n# AGENT INSTRUCTIONS\n{system_prompt}"

        # Dynamic prompt customization via hooks
        custom_prompts = extension_manager.pm.hook.on_agent_init(agent_name=agent_name)
        if custom_prompts:
            for cp in custom_prompts:
                if cp:
                    final_system_prompt += f"\n\n# EXTENSION\n{cp}"

        if not active_tools:
            final_system_prompt += f"\n\n{NO_TOOLS_WARNING}"
        else:
            final_system_prompt += f"\n\n{TOOL_PROTOCOL}"

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

    def ask_permission_node(state: AgentState):
        """
        Node that pauses execution and asks the user for permission.
        In a real scenario, this would emit a UI event and wait for 'resume'.
        For now, we simulate a system message requesting approval.
        """
        tool_call_id = state.get("pending_tool_call")
        # Find the tool call in the last AI message to get details if needed
        # (Simplified for now)
        
        # We return a system message that the UI should interpret as a blocking modal
        # Or, strictly speaking, this node's output indicates to the UI "SHOW_APPROVAL_MODAL".
        # The graph effectively STOPS here if we returned interrupt, but since we are simple:
        return {"messages": [AIMessage(content=f"SYSTEM_APPROVAL_REQUEST: The extension wants to execute '{tool_call_id}'. Do you authorize? (Reply 'YES' to confirm)")]}

    # Verify if 'responder' has a manifest. Yes, 'com.momai.builtin.responder'.
    
    workflow = StateGraph(AgentState)
    
    workflow.add_node("specialist_node", specialist_node)
    workflow.add_node("semantic_router", semantic_router)
    workflow.add_node("mom_orchestrator", mom_orchestrator)
    workflow.add_node("ask_permission", ask_permission_node) # Safety Node
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

    def route_tool_execution(state: AgentState):
        """
        Decides if we go to 'tools', 'ask_permission', or 'END'.
        Check if the tool is safe.
        """
        last_msg = state["messages"][-1]
        
        # 1. User Feedback Loop (Handling user response to permission request)
        if len(state["messages"]) >= 2:
             second_last = state["messages"][-2]
             if "SYSTEM_APPROVAL_REQUEST" in str(second_last.content):
                 # Check user's answer
                 user_response = str(last_msg.content).upper()
                 if "YES" in user_response or "SIM" in user_response:
                     return "tools" # Approved
                 else:
                     return "specialist_node" # Denied, back to agent
        
        # 2. Normal Flow: Check for tool calls
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            # Check safety of the FIRST tool call (simplify for now)
            tool_call = last_msg.tool_calls[0]
            tool_name = tool_call["name"]
            
            # --- SAFETY CHECK ---
            # If tool is in CORE or SAFE list -> OK.
            # Otherwise -> ASK PERMISSION.
            is_safe = tool_name in CORE_GLOBAL_TOOLS or tool_name.startswith("system_") # Example heuristic
            
            if is_safe:
                return "tools"
            else:
                # Mark which tool is pending
                return "ask_permission" # Intercept!
            
        return END  # Direct exit if no tools called

    workflow.add_conditional_edges("specialist_node", route_tool_execution)
    
    # Permission node -> Wait for User Input (Logic handled by outer loop usually, but here we loop back to human)
    # In a real heavy app we use 'interrupt_before', but here we map to END to wait for user input
    # OR we map to END if we want the user to type "YES".
    # Let's say ask_permission outputs a message and goes to END (waiting for user).
    workflow.add_edge("ask_permission", END) 
    
    # Logic:
    # 1. Specialist -> Tool Call (Risky)
    # 2. Router -> ask_permission
    # 3. Ask Permission -> returns msg "Do you allow?" -> END
    # 4. User types "YES" -> Graph resumes (via main loop appending msg) -> Specialist (Wait, specialist would re-process user msg)
    # We need to bridge User Reply -> Tool Execution.
    # Actually, if User types YES, we should go `tools` node directly? 
    # No, because `tools` node expects the LAST message to be an AIMessage with tool_calls.
    # If we insert a HumanMessage("YES"), the last message is Human. `ToolNode` will fail or do nothing.
    
    # FIX: We need a 'FormatApproval' node or simply instruct the Agent to CALL THE TOOL AGAIN if approved.
    # Simplest approach for v1:
    # If Denied/Approved -> Back to Specialist. usage: "User Approved executed X".
    # Specialist sees "User Approved" and calls tool again (this time we might need a state flag 'approved=True' to bypass check?)
    
    # Let's clean up:
    # Route -> ask_permission -> END.
    # User -> "YES" -> Specialist.
    # Specialist -> "Ah, user said yes, let me call the tool again."
    # Route -> "Oh, it's the same risky tool, BUT do we have approval?"
    
    # We'll rely on the Agent's context for now.
    
    # Tools go back to specialist to interpret results (ReAct Loop)
    workflow.add_edge("tools", "specialist_node")
    
    return workflow.compile(checkpointer=checkpointer)