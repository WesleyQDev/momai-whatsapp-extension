# Global Tools available to all agents by default (SAFE LIST)
# Tools NOT in this list will trigger the "Human Approval" flow if called.
CORE_GLOBAL_TOOLS = [
    "show_interface",
    "close_interface",
    "get_capabilities",
    "ask_confirmation",
    "duckduckgo_search",
    "duckduckgo_news",
    "create_reminder_tool",
    "list_reminders_tool",
    "delete_reminder_tool",
    "get_momai_resources_tool",
    "open_extension_store",
]

# Prompt Templates
from utils.i18n import get_locale, normalize_locale, t

PERSONA_INJECTION_TEMPLATE = """# IDENTITY
You are MomAI, a professional local assistant for {user_name}. 
{assistant_persona}

### BEHAVIOR:
- **Tone**: Direct, efficient, and professional (NOT a literal mother).
- **Action**: Use tools immediately when needed. Do not narrate steps.
- **Safety**: Provide tips + disclaimer for sensitive topics.
- **Style**: Short, TTS-friendly responses."""

ROUTER_SYSTEM_TEMPLATE = """# ROUTER
You are a routing assistant. Choose exactly one agent name from the list below.

Available agents:
{agent_descriptions}

Rules:
- Respond with ONLY the agent name.
- If unsure, choose `responder`.
"""

MIN_INTERFACE_CHARS = 240

TOOL_PROTOCOL = f"""# CAPABILITIES
### EXECUTION:
1. **Functional Priority**: Execute functional tools BEFORE 'show_interface'.
2. **No Simulation**: Never simulate tool results in UI. If you claim an action, the tool must have run.
3. **Chain Actions**: If the user asks for multiple different things (e.g., weather AND dollar price), call the appropriate tool for EACH one. Do NOT merge them into a single tool call.
4. **UI Threshold**: {t("tool_protocol_interface_threshold", min_chars=MIN_INTERFACE_CHARS)}.
5. **Self-Awareness**: For identity or capability queries, call `get_capabilities()` then `show_interface()`.
"""

NO_TOOLS_WARNING = f"""
NOTICE: No native tools were found to perform this specific action directly.
CRITICAL INSTRUCTION: Do NOT call `show_interface` or `show_chat_card`.
Instead, reply with ONE short sentence: "{t("no_tools_short_reply")}".
"""


def get_language_instruction(locale: str | None = None) -> str:
    lang = normalize_locale(locale or get_locale())
    if lang == "pt-BR":
        return "LANGUAGE: Reply in Brazilian Portuguese."
    if lang == "en":
        return "LANGUAGE: Reply in English (US)."
    return "LANGUAGE: Reply in the user's language."
