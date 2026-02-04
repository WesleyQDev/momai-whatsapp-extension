
# Global Tools available to all agents by default
# Global Tools available to all agents by default
# Global Tools available to all agents by default (SAFE LIST)
# Tools NOT in this list will trigger the "Human Approval" flow if called.
CORE_GLOBAL_TOOLS = [
    # 1. UI & Interaction
    "show_interface",
    "close_interface",
    "get_capabilities",
    "ask_confirmation",
    
    # 2. Web Search (Safe read-only)
    "duckduckgo_search",
    
    # 3. Scheduler (Safe internal db)
    "create_reminder_tool",
    "list_reminders_tool",
    "delete_reminder_tool",
    
    # 4. AI Meta-Control (Self-configuration)
    "open_model_selector",
    "switch_ai_model",
    "get_momai_resources_tool"
]

# Prompt Templates
ROUTER_SYSTEM_TEMPLATE = """Route the request to the best specialist.
Available specialists:
{agent_descriptions}
- `responder`: General chat/greeting.
Pick ONE."""

PERSONA_INJECTION_TEMPLATE = """You are engaging with {user_name}.
If {assistant_persona}: # PERSONA
{assistant_persona}
CRITICAL: Keep your verbal response extremely SHORT and PUNCHY. One or two sentences maximum. Great for TTS."""

TOOL_PROTOCOL = """
TOOL PROTOCOL: You have tools bound to this session. If you need to perform a system action or display information, you MUST generate a 'tool_call' instead of just describing the action in text. Never simulate a tool result in the chat.

INTERFACE USAGE GUIDELINES:
- **Chat vs. Interface**: Keep your main chat responses SHORT and CONCISE (ideal for voice/TTS).
- **Rich Content & Lists**: If you need to present LISTS, reports, long explanations, code snippets, or data analysis, you **MUST** use `show_interface(view='side', content=...)`.
- **User Request**: If the user explicitly asks to "show", "list in interface", "open side panel", etc., you **MUST** use `show_interface`.
- **Decisions**: If you need user confirmation or simple choices, use `ask_confirmation` or `show_interface(view='side', ...)` (Center view is temporarily disabled).

Use `get_capabilities` to inspect your own tools if needed, but ALWAYS display the result in the Side Interface using `show_interface`."""


NO_TOOLS_WARNING = """
NOTICE: No native tools were found to perform this specific action directly.
CRITICAL INSTRUCTION: Do NOT just say "I can't do that".
Instead, act as a helpful assistant that can expand its own capabilities.
Response Protocol:
1. Briefly state you don't have this skill *installed* yet.
2. IMMEDIATELY offer to search the Extension Store for a plugin that can helper.
   Example: "I don't have a browser control extension installed yet. Would you like me to check the Store for one?"
3. If the user agrees, your next action (in the next turn) would be to call a search tool (or 'search_store' if/when available)."""
