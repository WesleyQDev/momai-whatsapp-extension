import os
import json
import re
import asyncio
from datetime import datetime
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from services.extensions.manager import extension_manager
from utils.tokenizer import count_tokens, count_message_tokens, get_context_window
from ai.tool_selector import select_tool_names_for_query

import logging
logger = logging.getLogger("momai.graph")

def log_event(title: str, content: str, color: str = ""):
    """Log via standard logging to ensure visibility in Electron terminal."""
    print(f">>> [{title}] {content}")
    logger.info(f">>> [{title}] {content}")

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    summary: str | None
    memory_context: str | None
    discovered_skills: list[dict] | None 
    active_skill_id: str | None          
    skill_result: str | None             
    fast_path: bool | None

def _compute_history_budget(system_prompt: str, summary: str | None, budget_pct: float = 0.7) -> int:
    ctx_total = get_context_window()
    reserve = int(ctx_total * (1 - budget_pct))
    overhead = count_tokens(system_prompt or "")
    if summary: overhead += count_tokens(summary)
    return max(256, ctx_total - reserve - overhead)

def get_valid_history(messages: Sequence[BaseMessage], max_messages: int, budget: int) -> list[BaseMessage]:
    if not messages: return []
    # Remove empty messages or messages that might break the sequence
    clean = []
    for m in messages:
        if (m.content and str(m.content).strip()) or (hasattr(m, "tool_calls") and m.tool_calls):
            clean.append(m)
    
    selected = []
    used = 0
    for m in reversed(clean):
        if len(selected) >= max_messages: break
        tokens = count_message_tokens(getattr(m, "type", ""), str(m.content) if m.content else "")
        if used + tokens > budget: break
        selected.append(m)
        used += tokens
    
    res = list(reversed(selected))
    
    # Protocol fix: Ensure history doesn't start with a ToolMessage or have consecutive Assistant messages
    while res and isinstance(res[0], ToolMessage): res.pop(0)
    
    # Ensure no consecutive assistant messages at the end
    final_clean = []
    for i, m in enumerate(res):
        if i > 0 and m.type == "assistant" and final_clean[-1].type == "assistant":
            continue # Skip consecutive assistant messages
        final_clean.append(m)
        
    return final_clean

from ai.constants import (
    get_language_instruction,
    PERSONA_INJECTION_TEMPLATE,
    TOOL_PROTOCOL
)

def create_momai_graph(llm, user_name="Sir", assistant_persona=None, checkpointer=None):
    from database.vector_db import vector_db
    from tools.system_actions import get_all_tools_registry

    async def discovery_router(state: AgentState):
        if not state.get("messages"): return {"next": "momai_agent", "fast_path": True}
        last_msg = str(state["messages"][-1].content)
        log_event("Discovery", f"Query: {last_msg}")
        
        greetings = r"^(oi|ol[aá]|tudo bem|bom dia|boa tarde|boa noite|opa|e ai|eae|salve|oba|co[eé]|ei|hey|hello|hi)(\?|\!|\s|$)"
        if re.search(greetings, last_msg.strip().lower()):
            return {"fast_path": True, "discovered_skills": []}

        from services.memory.external_memory import build_memory_context
        tasks = [vector_db.search_skills(last_msg, limit=4), build_memory_context(last_msg)]
        skill_hits, mem_context = await asyncio.gather(*tasks)

        skills_brief = []
        if skill_hits:
            for hit in skill_hits:
                skill_id = hit.get("id", "")
                if "responder" in skill_id: continue
                dist = hit.get("_distance", 1.0)
                if dist < 0.95:
                    skills_brief.append({"id": skill_id, "name": hit["name"], "description": hit["description"]})
                    log_event("Discovery", f"Active Skill: {skill_id} (conf: {(1-dist)*100:.1f}%)")

        return {"discovered_skills": skills_brief, "memory_context": mem_context, "fast_path": False}

    async def manager_node(state: AgentState):
        log_event("Manager", "Orchestrating...")
        lang = get_language_instruction()
        persona = PERSONA_INJECTION_TEMPLATE.format(user_name=user_name, assistant_persona=assistant_persona or "")
        
        system_prompt = (
            f"{lang}\n\n{persona}\n\n"
            "# ROLE\n"
            "You are the Central Manager. Decide which SKILL to use for the request.\n\n"
            "# DISCOVERED SKILLS\n"
        )
        
        skills = state.get("discovered_skills") or []
        for s in skills:
            system_prompt += f"- ID: '{s['id']}' | Competency: {s['description']}\n"

        system_prompt += (
            "\n# EXECUTION PROTOCOL\n"
            "1. To use a skill, you MUST call 'activate_skill(skill_id, task_description)'.\n"
            "2. NEVER invent personal data. If no skill matches, say you don't have access."
        )

        from langchain_core.tools import tool
        @tool
        def activate_skill(skill_id: str, task_description: str):
            """Delegates a task to a specialist worker."""
            return f"Delegating to {skill_id}..."

        manager_tools = [activate_skill]
        all_reg = get_all_tools_registry()
        for t in ["show_interface", "close_interface"]:
            if all_reg.get(t): manager_tools.append(all_reg[t])

        prompt = ChatPromptTemplate.from_messages([("system", system_prompt), MessagesPlaceholder(variable_name="messages")])
        chain = prompt | llm.bind_tools(manager_tools)
        budget = _compute_history_budget(system_prompt, state.get("summary"))
        result = await chain.ainvoke({"messages": get_valid_history(state["messages"], 8, budget)})
        return {"messages": [result]}

    async def specialist_node(state: AgentState):
        """
        Specialist Worker with internal ReAct loop.
        It will not return until the task is actually completed.
        """
        last_msg = state["messages"][-1]
        if not last_msg.tool_calls: return {"messages": [AIMessage(content="Error: No skill requested.")]}
        
        skill_call = last_msg.tool_calls[0]
        skill_id, task = skill_call["args"]["skill_id"], skill_call["args"]["task_description"]
        log_event("Specialist", f"Running: {skill_id}")
        
        skill = extension_manager.get_skill(skill_id)
        if not skill: return {"messages": [ToolMessage(content="Skill not found.", tool_call_id=skill_call["id"])]}
        skill.load_full_content()
        
        system_instructions = (
            f"{get_language_instruction()}\n\n"
            f"# ROLE: {skill.name}\n{skill.full_instructions}\n\n"
            f"# TASK: {task}\n"
            "Use your tools. Return ONLY the final factual data found."
        )

        registry = get_all_tools_registry()
        skill_tools = [registry[t] for t in skill.allowed_tools if t in registry]
        
        # Internal Loop to actually execute tools
        prompt = ChatPromptTemplate.from_messages([("system", system_instructions), ("human", "{task}")])
        chain = prompt | llm.bind_tools(skill_tools) if skill_tools else prompt | llm
        
        # 1. Ask the model
        worker_res = await chain.ainvoke({"task": task})
        
        # 2. If the worker wants tools, execute them immediately
        if hasattr(worker_res, "tool_calls") and worker_res.tool_calls:
            results_map = []
            for tc in worker_res.tool_calls:
                tool_obj = registry.get(tc["name"])
                if tool_obj:
                    res = await tool_obj.ainvoke(tc["args"])
                    results_map.append(f"Tool {tc['name']} result: {res}")
            
            # 3. Final pass with tool results
            final_prompt = f"{system_instructions}\n\n# TOOL RESULTS\n" + "\n".join(results_map)
            worker_res = await llm.ainvoke([SystemMessage(content=final_prompt), HumanMessage(content=task)])

        return {"messages": [ToolMessage(content=str(worker_res.content), tool_call_id=skill_call["id"])]}

    workflow = StateGraph(AgentState)
    workflow.add_node("router", discovery_router)
    workflow.add_node("momai_agent", manager_node)
    workflow.add_node("specialist_worker", specialist_node)
    workflow.add_node("tools", dynamic_tools_node)

    workflow.set_entry_point("router")
    workflow.add_edge("router", "momai_agent")

    def route_manager(state: AgentState):
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "specialist_worker" if last_msg.tool_calls[0]["name"] == "activate_skill" else "tools"
        return END

    workflow.add_conditional_edges("momai_agent", route_manager)
    workflow.add_edge("specialist_worker", "momai_agent")
    workflow.add_edge("tools", "momai_agent")

    return workflow.compile(checkpointer=checkpointer)

async def dynamic_tools_node(state: AgentState):
    from langchain_core.messages import ToolMessage
    last_msg = state["messages"][-1]
    if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls: return {"messages": []}
    registry = get_all_tools_registry()
    tool_messages = []
    for tc in last_msg.tool_calls:
        tool = registry.get(tc["name"])
        if tool:
            res = await tool.ainvoke(tc["args"])
            tool_messages.append(ToolMessage(content=str(res), tool_call_id=tc["id"]))
    return {"messages": tool_messages}
