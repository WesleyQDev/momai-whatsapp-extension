import os

DEFAULT_LOCALE = os.getenv("MOMAI_LOCALE", "pt-BR")

_STRINGS = {
    "pt-BR": {
        "missing_capability_card_content": "Ainda nao aprendi a fazer isso, mas posso aprender com uma extensao.",
        "missing_capability_card_cta": "Abrir Loja de Extensoes",
        "no_tools_short_reply": "Posso aprender isso se voce instalar uma extensao.",
        "tool_protocol_chat_short": "Mantenha respostas curtas para TTS.",
        "tool_protocol_interface_threshold": "Use interface apenas para listas, tabelas, codigos, ou conteudo com mais de {min_chars} caracteres.",
        "tool_protocol_user_request": "Se o usuario pedir explicitamente para mostrar na interface, voce deve usar show_interface.",
    },
    "en": {
        "missing_capability_card_content": "I can learn this if you install an extension.",
        "missing_capability_card_cta": "Open Extensions Store",
        "no_tools_short_reply": "I can learn this if you install an extension.",
        "tool_protocol_chat_short": "Keep chat replies short for TTS.",
        "tool_protocol_interface_threshold": "Use the interface only for lists, tables, code, or content over {min_chars} characters.",
        "tool_protocol_user_request": "If the user explicitly asks to show in the interface, you must call show_interface.",
    },
}

_ALIASES = {
    "en-US": "en",
    "en-GB": "en",
}


def normalize_locale(locale: str | None) -> str:
    if not locale:
        return DEFAULT_LOCALE
    if locale in _STRINGS:
        return locale
    alias = _ALIASES.get(locale)
    if alias:
        return alias
    base = locale.split("-")[0]
    if base in _STRINGS:
        return base
    return locale


def get_locale() -> str:
    env_locale = os.getenv("MOMAI_LOCALE")
    if env_locale:
        return env_locale

    try:
        from database.models import SessionLocal, Settings
        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            if settings and settings.locale:
                return settings.locale
        finally:
            db.close()
    except Exception:
        pass

    return DEFAULT_LOCALE


def t(key: str, locale: str | None = None, **kwargs) -> str:
    lang = normalize_locale(locale or get_locale())
    data = _STRINGS.get(lang) or _STRINGS.get("pt-BR", {})
    text = data.get(key, key)
    if kwargs:
        try:
            return text.format(**kwargs)
        except Exception:
            return text
    return text
