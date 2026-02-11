
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
    "get_momai_resources_tool",
    "open_extension_store"
]

# Prompt Templates
from utils.i18n import get_locale, normalize_locale, t
ROUTER_SYSTEM_TEMPLATE = """Route the request to the best specialist.
Available specialists:
{agent_descriptions}
- `responder`: General chat/greeting.
Pick ONE."""

PERSONA_INJECTION_TEMPLATE = """You are engaging with {user_name}.
If {assistant_persona}: # PERSONA
{assistant_persona}

### BEHAVIORAL GUIDELINES:
- **Sensitive Topics (Health, Legal, etc.)**: Be proactive and helpful. Provide general, common-sense tips or useful information first. After providing tips, ALWAYS recommend that the user consults a qualified professional (doctor, lawyer, etc.) for specific advice. Never refuse to help; instead, provide the best general assistance possible with the professional disclaimer.
- **Conciseness**: Keep your verbal response SHORT and PUNCHY. While you can provide tips for sensitive topics, avoid long essays. Aim for clarity and efficiency, ideal for TTS."""

MIN_INTERFACE_CHARS = 240

TOOL_PROTOCOL = f"""
TOOL PROTOCOL: You have tools bound to this session. If you need to perform a system action or display information, you MUST generate a 'tool_call' instead of just describing the action in text. Never simulate a tool result in the chat.

ANTI-HALLUCINATION RULES:
- Do NOT fabricate file paths, system states, or UI outputs.
- Only show interfaces that reflect real tool results.
- If the requested action requires OS/file access and no suitable tool is available, follow the NO_TOOLS_WARNING flow.

INTERFACE USAGE GUIDELINES:
- **Chat vs. Interface**: {t("tool_protocol_chat_short")}
- **Rich Content & Lists**: {t("tool_protocol_interface_threshold", min_chars=MIN_INTERFACE_CHARS)}
- **User Request**: {t("tool_protocol_user_request")}
- **Decisions**: If you need user confirmation or simple choices, use `ask_confirmation` or `show_interface(view='side', ...)` (Center view is temporarily disabled).

SPECIFIC CAPABILITIES FLOW:
If the user asks "What can you do?", "What are your capabilities?", "Help", or similar commands (in any language):
1. Call `get_capabilities()` to retrieve the raw list of tools/extensions.
2. Translate/Format the list into the USER'S LANGUAGE.
3. Call `show_interface(view='side', content=...)` with the formatted list.
4. Reply briefly in chat: "Here is what I can do." (or translated equivalent).
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
