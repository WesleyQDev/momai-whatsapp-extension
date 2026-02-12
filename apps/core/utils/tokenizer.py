import os
import requests
from functools import lru_cache

DEFAULT_CTX_SIZE = int(os.getenv("MOMAI_CTX_SIZE", "8192"))


def get_context_window() -> int:
    try:
        return int(os.getenv("MOMAI_CTX_SIZE", str(DEFAULT_CTX_SIZE)))
    except Exception:
        return DEFAULT_CTX_SIZE


@lru_cache(maxsize=1024)
def count_tokens(text: str) -> int:
    """
    Counts tokens locally using a fast heuristic (approx 4 chars per token).
    Avoids expensive and synchronous HTTP calls to llama-server during graph execution.
    """
    if not text:
        return 0
    
    # Heuristic: approx 4 characters per token for latin languages
    # This is sufficient for context window budgeting in MomAI
    return max(1, len(text) // 4)


def count_message_tokens(role: str, content: str) -> int:
    """Estimates tokens for a single message."""
    prefix = f"{role}: " if role else ""
    return count_tokens(prefix + (content or ""))
