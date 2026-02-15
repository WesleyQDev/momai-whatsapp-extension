import os
import json
import re
import asyncio
from datetime import datetime
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
    SystemMessage,
)
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from services.extensions.manager import extension_manager
from utils.tokenizer import count_tokens, count_message_tokens, get_context_window
from ai.tool_selector import select_tool_names_for_query
from tools.system_actions import get_all_tools_registry

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
    search_count: int | None
    tool_results: list[str] | None
    skill_id: str | None
    task: str | None
    next_step: str | None
    tool_call_id: str | None


def _compute_history_budget(
    system_prompt: str, summary: str | None, budget_pct: float = 0.7
) -> int:
    ctx_total = get_context_window()
    reserve = int(ctx_total * (1 - budget_pct))
    overhead = count_tokens(system_prompt or "")
    if summary:
        overhead += count_tokens(summary)
    return max(256, ctx_total - reserve - overhead)


def get_valid_history(
    messages: Sequence[BaseMessage], max_messages: int, budget: int
) -> list[BaseMessage]:
    if not messages:
        return []
    # Remove empty messages or messages that might break the sequence
    clean = []
    for m in messages:
        if (m.content and str(m.content).strip()) or (
            hasattr(m, "tool_calls") and m.tool_calls
        ):
            clean.append(m)

    selected = []
    used = 0
    for m in reversed(clean):
        if len(selected) >= max_messages:
            break
        tokens = count_message_tokens(
            getattr(m, "type", ""), str(m.content) if m.content else ""
        )
        if used + tokens > budget:
            break
        selected.append(m)
        used += tokens

    res = list(reversed(selected))

    # Protocol fix: Ensure history doesn't start with a ToolMessage or have consecutive Assistant messages
    while res and isinstance(res[0], ToolMessage):
        res.pop(0)

    # Ensure no consecutive assistant messages at the end
    final_clean = []
    for i, m in enumerate(res):
        if i > 0 and m.type == "assistant" and final_clean[-1].type == "assistant":
            continue  # Skip consecutive assistant messages
        final_clean.append(m)

    return final_clean


from ai.constants import (
    get_language_instruction,
    PERSONA_INJECTION_TEMPLATE,
    TOOL_PROTOCOL,
)


def create_momai_graph(llm, user_name="Sir", assistant_persona=None, checkpointer=None):
    from database.vector_db import vector_db
    from tools.system_actions import get_all_tools_registry

    async def discovery_router(state: AgentState):
        if not state.get("messages"):
            return {"next": "momai_agent", "fast_path": True}
        last_msg = str(state["messages"][-1].content)
        log_event("Discovery", f"Query: {last_msg}")

        greetings = r"^(oi|ol[aá]|tudo bem|bom dia|boa tarde|boa noite|opa|e ai|eae|salve|oba|co[eé]|ei|hey|hello|hi)(\?|\!|\s|$)"
        if re.search(greetings, last_msg.strip().lower()):
            return {"fast_path": True, "discovered_skills": []}

        from services.memory.external_memory import build_memory_context

        tasks = [
            vector_db.search_skills(last_msg, limit=4),
            build_memory_context(last_msg),
        ]
        skill_hits, mem_context = await asyncio.gather(*tasks)

        skills_brief = []
        if skill_hits:
            for hit in skill_hits:
                skill_id = hit.get("id", "")
                if "responder" in skill_id:
                    continue
                dist = hit.get("_distance", 1.0)
                if dist < 0.95:
                    skills_brief.append(
                        {
                            "id": skill_id,
                            "name": hit["name"],
                            "description": hit["description"],
                        }
                    )
                    log_event(
                        "Discovery",
                        f"Active Skill: {skill_id} (conf: {(1 - dist) * 100:.1f}%)",
                    )

        return {
            "discovered_skills": skills_brief,
            "memory_context": mem_context,
            "fast_path": False,
        }

    async def manager_node(state: AgentState):
        log_event("Manager", "Orchestrating...")
        lang = get_language_instruction()
        persona = PERSONA_INJECTION_TEMPLATE.format(
            user_name=user_name, assistant_persona=assistant_persona or ""
        )

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
            "1. FIRST, briefly acknowledge the user's request or state your intent (e.g., 'Vou verificar isso...', 'Searching for...').\n"
            "2. THEN, call 'activate_skill(skill_id, task_description)' or other tools.\n"
            "3. NEVER invent personal data. If no skill matches, say you don't have access."
        )

        from langchain_core.tools import tool

        @tool
        def activate_skill(skill_id: str, task_description: str):
            """Delegates a task to a specialist worker."""
            return f"Delegating to {skill_id}..."

        manager_tools = [activate_skill]
        all_reg = get_all_tools_registry()
        for t in ["show_interface", "close_interface", "search"]:
            if all_reg.get(t):
                manager_tools.append(all_reg[t])

        # Fortalecer o prompt para forçar uso de ferramentas
        system_prompt += (
            "\n# CRITICAL INSTRUCTIONS\n"
            "You MUST use a tool. Do NOT just describe what you will do.\n"
            "If the user asks for information, use 'activate_skill' or available tools to get it.\n"
            "NEVER respond with text only - always take action with tools.\n"
        )

        prompt = ChatPromptTemplate.from_messages(
            [("system", system_prompt), MessagesPlaceholder(variable_name="messages")]
        )
        chain = prompt | llm.bind_tools(manager_tools)
        budget = _compute_history_budget(system_prompt, state.get("summary"))
        result = await chain.ainvoke(
            {"messages": get_valid_history(state["messages"], 8, budget)}
        )
        return {"messages": [result]}

    async def specialist_node(state: AgentState):
        """
        Specialist Worker - returns tool_calls for the graph to execute.
        This ensures tool events are emitted for real-time UI updates.
        """
        last_msg = state["messages"][-1]

        # Check if this is a ToolMessage (results from previous tool execution)
        if isinstance(last_msg, ToolMessage):
            # Get skill_id and task from state (set on first call)
            skill_id = state.get("skill_id")
            task = state.get("task")
            if not skill_id or not task:
                return {"messages": [AIMessage(content="Error: No skill context.")]}
        else:
            # First call - check for activate_skill tool call
            if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
                return {"messages": [AIMessage(content="Error: No skill requested.")]}

            skill_call = last_msg.tool_calls[0]
            skill_id, task = (
                skill_call["args"]["skill_id"],
                skill_call["args"]["task_description"],
            )
            # Save tool_call_id for later use
            state["tool_call_id"] = skill_call["id"]

        log_event("Specialist", f"Running: {skill_id}")

        skill = extension_manager.get_skill(skill_id)
        if not skill:
            return {
                "messages": [
                    ToolMessage(
                        content="Skill not found.", tool_call_id=skill_call["id"]
                    )
                ]
            }
        skill.load_full_content()

        system_instructions = (
            f"{get_language_instruction()}\n\n"
            f"# ROLE: {skill.name}\n{skill.full_instructions}\n\n"
            f"# TASK: {task}\n\n"
            "# CRITICAL INSTRUCTIONS:\n"
            "1. If the user asks about MULTIPLE DIFFERENT topics, make SEPARATE search calls for EACH topic.\n"
            "2. Example: 'preço dólar e temperatura Curitiba' = 1 call for dólar, 1 call for temperatura.\n"
            "3. Call the search tool as many times as needed (up to 3 total).\n"
            "4. Do NOT describe what you will search - just call the tool.\n"
            "5. ONLY after getting ALL search results, provide the final answer.\n"
            "6. Your response must start directly with the answer - no preamble.\n"
        )

        registry = get_all_tools_registry()
        skill_tools = [registry[t] for t in skill.allowed_tools if t in registry]

        prompt = ChatPromptTemplate.from_messages(
            [("system", system_instructions), ("human", "{task}")]
        )
        chain = prompt | llm.bind_tools(skill_tools) if skill_tools else prompt | llm

        # Check if there are tool results in state from previous iteration
        tool_results = state.get("tool_results", [])
        if tool_results:
            results_text = "\n\n".join(tool_results)
            count = len(tool_results)
            user_input = (
                f"Search results so far ({count} searches):\n{results_text}\n\n"
                f"Original task: {task}\n\n"
                "If you need MORE information, call the search tool again. "
                "Otherwise, provide your final answer."
            )
        else:
            user_input = task

        worker_res = await chain.ainvoke({"task": user_input})

        # If tool calls, return them for graph to execute
        if hasattr(worker_res, "tool_calls") and worker_res.tool_calls:
            return {
                "messages": [worker_res],
                "skill_id": skill_id,
                "task": task,
            }

        # No more tool calls - return final answer
        final_content = (
            worker_res.content if hasattr(worker_res, "content") else str(worker_res)
        )

        # Get tool_call_id from state or from skill_call
        tool_call_id = state.get("tool_call_id")
        if not tool_call_id and hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            tool_call_id = last_msg.tool_calls[0]["id"]

        return {
            "messages": [
                ToolMessage(
                    content=str(final_content), tool_call_id=tool_call_id or "unknown"
                )
            ]
        }

    def search_counter_node(state: AgentState):
        """Count search results and emit for UI."""
        tool_count = 0
        for msg in state["messages"]:
            if isinstance(msg, ToolMessage):
                tool_count += 1
        if tool_count > 0:
            print(f">>> [SearchCount] {tool_count}")
            logger.info(f">>> [SearchCount] {tool_count}")
        return {"search_count": tool_count}

    def route_specialist(state: AgentState):
        """Route specialist output: if tool_calls, go to tools; else end."""
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "tools"
        return END

    def prepare_tool_results(state: AgentState):
        """Convert ToolMessage results to format for specialist."""
        tool_results = []
        for msg in state["messages"]:
            if isinstance(msg, ToolMessage):
                tool_results.append(msg.content)
        return {"tool_results": tool_results, "next_step": None}

    workflow = StateGraph(AgentState)
    workflow.add_node("router", discovery_router)
    workflow.add_node("momai_agent", manager_node)
    workflow.add_node("specialist_worker", specialist_node)
    workflow.add_node("prepare_tool_results", prepare_tool_results)
    workflow.add_node("search_counter", search_counter_node)
    workflow.add_node("tools", dynamic_tools_node)

    workflow.set_entry_point("router")
    workflow.add_edge("router", "momai_agent")

    def route_manager(state: AgentState):
        from langchain_core.messages import ToolMessage

        last_msg = state["messages"][-1]

        # Se a última mensagem for ToolMessage (resultado do specialist), termina
        if isinstance(last_msg, ToolMessage):
            return END

        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return (
                "specialist_worker"
                if last_msg.tool_calls[0]["name"] == "activate_skill"
                else "tools"
            )
        return END

    workflow.add_conditional_edges("momai_agent", route_manager)
    workflow.add_conditional_edges("specialist_worker", route_specialist)

    def route_tools(state: AgentState):
        """Route tools output: back to specialist if skill_id exists, else back to manager."""
        return state.get("next_step", "momai_agent")

    workflow.add_conditional_edges("tools", route_tools)
    workflow.add_edge("prepare_tool_results", "specialist_worker")
    workflow.add_edge("specialist_worker", "search_counter")
    workflow.add_edge("search_counter", END)

    return workflow.compile(checkpointer=checkpointer)


async def dynamic_tools_node(state: AgentState):
    from langchain_core.messages import ToolMessage

    last_msg = state["messages"][-1]
    if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
        return {"messages": []}
    registry = get_all_tools_registry()
    tool_messages = []
    for tc in last_msg.tool_calls:
        tool = registry.get(tc["name"])
        if tool:
            res = await tool.ainvoke(tc["args"])
            tool_messages.append(ToolMessage(content=str(res), tool_call_id=tc["id"]))

    # Determine next step: if specialist called tools, go back to specialist; else go to manager
    has_skill_id = bool(state.get("skill_id"))
    next_step = "prepare_tool_results" if has_skill_id else "momai_agent"
    return {"messages": tool_messages, "next_step": next_step}
