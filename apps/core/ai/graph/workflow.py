import operator
import os
import json
import re
import asyncio
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field
from services.extensions.manager import extension_manager
from utils.tokenizer import count_tokens, count_message_tokens, get_context_window

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
    summary: str | None
    no_tools: bool | None
    fast_path: bool | None
    memory_context: str | None

class Router(BaseModel):
    next: str = Field(description="The name of the specialist agent to handle the request.")

def _compute_history_budget(system_prompt: str, summary: str | None, budget_pct: float = 0.7) -> int:
    ctx_total = get_context_window()
    reserve = int(ctx_total * (1 - budget_pct))
    overhead = count_tokens(system_prompt or "")
    if summary:
        overhead += count_tokens(summary)
    budget = max(256, ctx_total - reserve - overhead)
    return budget


def get_valid_history(
    messages: Sequence[BaseMessage],
    max_messages: int,
    token_budget: int | None = None
) -> list[BaseMessage]:
    if not messages:
        return []

    clean_messages = [
        m for m in messages
        if (m.content and str(m.content).strip()) or (hasattr(m, "tool_calls") and m.tool_calls)
    ]

    if not clean_messages:
        return []

    budget = token_budget or 0
    selected: list[BaseMessage] = []
    used_tokens = 0

    for m in reversed(clean_messages):
        if max_messages and len(selected) >= max_messages:
            break

        role = getattr(m, "type", "")
        msg_tokens = count_message_tokens(role, str(m.content) if m.content else "")
        if budget and used_tokens + msg_tokens > budget:
            break

        selected.append(m)
        used_tokens += msg_tokens

    selected = list(reversed(selected))

    while selected and isinstance(selected[0], ToolMessage):
        selected.pop(0)

    return selected

from ai.constants import (
    CORE_GLOBAL_TOOLS,
    get_language_instruction,
    PERSONA_INJECTION_TEMPLATE,
    TOOL_PROTOCOL,
    NO_TOOLS_WARNING,
    ROUTER_SYSTEM_TEMPLATE
)

def create_momai_graph(llm, user_name="Sir", assistant_persona=None, checkpointer=None):
    from database.vector_db import vector_db

    intent_confidence_threshold = float(os.getenv("MOMAI_INTENT_CONFIDENCE", "0.45"))

    async def semantic_router(state: AgentState):
        """Dynamic routing via LanceDB."""
        # Safety fallback
        if not state.get("messages"):
             # If no messages, fallback to responder to avoid crash
             return {"next": "responder"}

        last_msg = str(state["messages"][-1].content)
        log_event("Semantic Router", f"Query: {last_msg}", "magenta")
        
        # 0. Quick Greeting Heuristic (Sub-millisecond shortcut)
        greetings = r"^(oi|ol[aá]|tudo bem|bom dia|boa tarde|boa noite|opa|e ai|eae|salve|oba|co[eé]|ei|hey|hello|hi)(\?|\!|\s|$)"
        clean_msg = last_msg.strip().lower()
        if re.search(greetings, clean_msg):
            log_event("Semantic Router", "Heuristic match: Greeting -> Fast Path bypass", "green")
            return {"next": "responder", "fast_path": True, "memory_context": ""}

        # 1. Fetch memory context once
        mem_context = ""
        try:
            from services.memory.external_memory import build_memory_context
            start_mem = asyncio.get_event_loop().time()
            mem_context = await build_memory_context(last_msg)
            mem_time = (asyncio.get_event_loop().time() - start_mem) * 1000
            log_event("Semantic Router", f"Memory search took {mem_time:.1f}ms", "magenta")
        except Exception as e:
            logger.warning(f"[Router] Memory fetch failed: {e}")

        # If we have a memory hit, we almost always want the general responder
        # to handle the context, unless the user explicitly wants a tool (handled next)
        if mem_context:
            log_event("Semantic Router", "Memory hit -> favoring responder", "magenta")
            # We don't return immediately because a tool intent might be stronger
        
        try:
            # 2. Intent Search (Vector DB)
            results = await vector_db.search_intent(last_msg, limit=1)
            if results:
                match = results[0]
                distance = match.get("_distance", 1.0)
                confidence = round((1 - distance) * 100, 1) if distance <= 1.0 else 0.0
                target = match.get("agent", "responder")
                matched_text = match.get("text", "unknown intent")

                # EDGE CASE: If distance is 0.000, it usually means Embeddings failed 
                # (returning all zeroes) unless it's an extremely short exact match.
                # In this state, LanceDB finds distance 0 to the first item.
                # We should favor responder in this suspicious state.
                if distance < 0.001:
                    log_event("Semantic Router", "Suspicious Dist 0.0 -> Forcing responder for safety", "yellow")
                    target = "responder"
                    confidence = 100.0

                log_event("Semantic Router", f"Match: '{matched_text}' | Agent: {target} | Conf: {confidence}% (Dist: {distance:.3f})", "magenta")

                # If confidence is mediocre or it's a general responder hit, don't let it trigger complex system agents
                if (target != "responder" and confidence < 75.0) or (mem_context and target == "responder"):
                    log_event("Semantic Router", "Ambiguous or memory-rich -> favoring responder", "magenta")
                    return {"next": "responder", "fast_path": not mem_context, "memory_context": mem_context}

                if (1 - distance) < intent_confidence_threshold:
                    log_event("Semantic Router", "Low intent confidence -> orchestrator", "magenta")
                    return {"next": "mom_orchestrator", "memory_context": mem_context}

                # Fast Path Detection
                is_fast = False
                if target == "responder" and confidence >= 85.0:
                    log_event("Semantic Router", "High confidence conversation -> Fast Path enabled", "green")
                    is_fast = True

                log_event("Semantic Router", f"Matched intent: '{matched_text}' ({confidence}% confidence) -> {target}", "magenta")
                return {"next": target, "fast_path": is_fast, "memory_context": mem_context}
        except Exception as e:
            logger.error(f"[Router] Error: {e}")
            
        return {"next": "mom_orchestrator", "memory_context": mem_context}

    async def mom_orchestrator(state: AgentState):
        """Strategic orchestrator (LLM) as fallback."""
        log_event("Strategic Orchestrator", "Analyzing intent...", "blue")
        
        # Generate the list of available agents dynamically for the router prompt
        manifests = extension_manager.get_active_manifests()
        agent_descriptions = "\n".join([f"- `{m['features']['agent_name']}`: {m['description']}" for m in manifests])

        system_msg = ROUTER_SYSTEM_TEMPLATE.format(agent_descriptions=agent_descriptions)
        summary_text = state.get("summary") or ""
        if summary_text:
            system_msg = f"{system_msg}\n\n# CONTEXT SUMMARY\n{summary_text}"

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_msg),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        try:
            chain = prompt | llm.with_structured_output(Router)
            budget = _compute_history_budget(system_msg, None)
            response = await chain.ainvoke({"messages": get_valid_history(state["messages"], 6, budget)})
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

        last_msg = state["messages"][-1].content
        
        # Tool RAG: Search relevant tools for non-responder agents
        tool_results = []
        if agent_name != "responder":
            tool_results = await vector_db.search_tools(str(last_msg), limit=4)
        
        # Cache the registry to avoid repeated complex imports and iterations
        if not hasattr(create_momai_graph, "_tools_cache"):
            from tools.system_actions import get_all_tools_registry
            create_momai_graph._tools_cache = get_all_tools_registry()
        
        all_registry = create_momai_graph._tools_cache
        
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
        # If responder, we only need basic UI tools. Full CORE_GLOBAL_TOOLS adds too much prompt overhead.
        relevant_globals = CORE_GLOBAL_TOOLS
        if agent_name == "responder":
             # Only UI and Capabilities for general chat
             relevant_globals = ["show_interface", "close_interface", "get_capabilities", "ask_confirmation", "open_extension_store"]
        
        if not state.get("fast_path"):
            for t_name in relevant_globals:
                 if t_name in AVAILABLE_TOOLS and t_name not in [t.name for t in active_tools]:
                     active_tools.append(AVAILABLE_TOOLS[t_name])
        else:
            # Even in fast path, if we are 'responder', we might need show_interface if the answer is long
            # but we can omit others to save prompt tokens
            if "show_interface" in AVAILABLE_TOOLS:
                active_tools.append(AVAILABLE_TOOLS["show_interface"])
            logger.info("[FastPath] Using minimal tool set for speed.")

        no_tools_available = not active_tools

        # Logic for Persona Injection
        system_prompt = manifest.system_prompt
        
        # 1. Static Persona & Instructions (Prime candidate for KV Cache)
        persona_instruction = PERSONA_INJECTION_TEMPLATE.format(
            user_name=user_name,
            assistant_persona=assistant_persona if assistant_persona else ""
        )
        language_instruction = get_language_instruction()
        
        # Merge static parts first
        final_system_prompt = (
            f"{language_instruction}\n\n"
            f"{persona_instruction}\n\n"
            f"# AGENT INSTRUCTIONS\n{system_prompt}"
        )

        # 2. Less static (Extension prompts, Summary, Memory)
        custom_prompts = extension_manager.get_agent_init_prompts(agent_name)
        if custom_prompts:
            for cp in custom_prompts:
                if cp:
                    final_system_prompt += f"\n\n# EXTENSION\n{cp}"

        summary_text = state.get("summary") or ""
        if summary_text:
            final_system_prompt += f"\n\n# CONVERSATION SUMMARY\n{summary_text}"

        memory_context = state.get("memory_context")
        if memory_context:
            final_system_prompt += f"\n\n# EXTERNAL MEMORY\n{memory_context}"

        # 3. Dynamic context (Changes every Turn/Second - Keeps prefix cached)
        # Inject Current Date/Time
        from datetime import datetime
        now = datetime.now()
        current_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
        weekday = now.strftime("%A")
        time_context = f"CURRENT DATE/TIME: {current_time_str} ({weekday})"
        final_system_prompt += f"\n\n{time_context}"

        # 4. Tool Protocol (Kept at end)
        if state.get("fast_path"):
            final_system_prompt += "\n\nResponda de forma direta e amigável. Caso a resposta seja longa ou técnica, você pode usar a ferramenta show_interface se necessário."
        elif not active_tools:
            final_system_prompt += f"\n\n{NO_TOOLS_WARNING}"
        else:
            final_system_prompt += f"\n\n{TOOL_PROTOCOL}"

        prompt = ChatPromptTemplate.from_messages([
            ("system", final_system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ])
        
        chain = prompt | llm.bind_tools(active_tools) if active_tools else prompt | llm
        
        # Invoke LLM
        # Reduced history from 15 to 8 for local LLM context optimization
        budget = _compute_history_budget(final_system_prompt, None)
        result = await chain.ainvoke({"messages": get_valid_history(state["messages"], 8, budget)})
        
        # Fallback to avoid empty model response
        if not result.content and not (hasattr(result, "tool_calls") and result.tool_calls):
            result.content = "I'm sorry, I couldn't find a specific tool to perform that action at the moment. How else can I help you?"

        if isinstance(result, BaseMessage): result.name = agent_name
        return {"messages": [result], "no_tools": no_tools_available}

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
    from tools.system_actions import get_all_tools_list, get_all_tools_registry
    
    async def dynamic_tools_node(state: AgentState):
        """Dynamic tool executor that fetches fresh tools at runtime."""
        from langchain_core.messages import ToolMessage
        import app_state
        
        last_msg = state["messages"][-1]
        if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
            return {"messages": []}
        
        # Get fresh tools registry at runtime
        tools_registry = get_all_tools_registry()
        
        def _stringify_payload(value: object) -> str:
            if value is None:
                return ""
            if isinstance(value, (dict, list, tuple)):
                try:
                    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
                except Exception:
                    text = str(value)
            else:
                text = str(value)
            if len(text) > 2000:
                return text[:2000] + "... (truncated)"
            return text

        tool_messages = []
        for tool_call in last_msg.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_id = tool_call["id"]
            
            tool = tools_registry.get(tool_name)
            if tool:
                try:
                    if app_state.main_loop:
                        payload = {
                            "type": "tool_start",
                            "data": {
                                "id": tool_id,
                                "name": tool_name,
                                "args": tool_args
                            }
                        }
                        asyncio.run_coroutine_threadsafe(
                            app_state.broadcast_to_sockets(payload),
                            app_state.main_loop
                        )
                    # Support both sync and async tools
                    if hasattr(tool, 'ainvoke'):
                        result = await tool.ainvoke(tool_args)
                    elif asyncio.iscoroutinefunction(getattr(tool, '_arun', None)):
                        result = await tool._arun(**tool_args)
                    else:
                        result = tool.invoke(tool_args)
                    if app_state.main_loop:
                        payload = {
                            "type": "tool_result",
                            "data": {
                                "id": tool_id,
                                "name": tool_name,
                                "args": tool_args,
                                "result": _stringify_payload(result),
                                "status": "ok"
                            }
                        }
                        asyncio.run_coroutine_threadsafe(
                            app_state.broadcast_to_sockets(payload),
                            app_state.main_loop
                        )
                    tool_messages.append(ToolMessage(content=str(result), tool_call_id=tool_id))
                except Exception as e:
                    logger.error(f"[Tools] Error executing {tool_name}: {e}")
                    if app_state.main_loop:
                        payload = {
                            "type": "tool_result",
                            "data": {
                                "id": tool_id,
                                "name": tool_name,
                                "args": tool_args,
                                "result": _stringify_payload(str(e)),
                                "status": "error"
                            }
                        }
                        asyncio.run_coroutine_threadsafe(
                            app_state.broadcast_to_sockets(payload),
                            app_state.main_loop
                        )
                    tool_messages.append(ToolMessage(content=f"Error: {str(e)}", tool_call_id=tool_id))
            else:
                if app_state.main_loop:
                    payload = {
                        "type": "tool_result",
                        "data": {
                            "id": tool_id,
                            "name": tool_name,
                            "args": tool_args,
                            "result": "Tool not found",
                            "status": "error"
                        }
                    }
                    asyncio.run_coroutine_threadsafe(
                        app_state.broadcast_to_sockets(payload),
                        app_state.main_loop
                    )
                tool_messages.append(ToolMessage(content=f"Error: Tool '{tool_name}' not found.", tool_call_id=tool_id))
        
        return {"messages": tool_messages}
    
    workflow.add_node("tools", dynamic_tools_node)
    
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
            # Retrieve the tool object to check for .safe attribute
            from tools.system_actions import get_all_tools_registry, SAFE_TOOLS_NAMES
            registry = get_all_tools_registry()
            tool_obj = registry.get(tool_name)
            
            # Default to False if tool not found or no safe attribute
            # We check both the hardcoded SAFE list AND the dynamic .safe attribute (for extensions)
            is_static_safe = tool_name in SAFE_TOOLS_NAMES
            is_dynamic_safe = getattr(tool_obj, 'safe', False) if tool_obj else False
            
            is_safe = is_static_safe or is_dynamic_safe
            
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