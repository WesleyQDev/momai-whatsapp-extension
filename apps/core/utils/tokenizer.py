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
    if not text:
        return 0

    endpoints = [
        "http://127.0.0.1:8080/tokenize",
        "http://127.0.0.1:8080/v1/tokenize",
    ]
    payloads = [
        {"content": text},
        {"text": text},
    ]

    for url in endpoints:
        for payload in payloads:
            try:
                res = requests.post(url, json=payload, timeout=1)
                if not res.ok:
                    continue
                data = res.json()
                if isinstance(data, dict):
                    tokens = data.get("tokens")
                    if isinstance(tokens, list):
                        return len(tokens)
                    token_count = data.get("token_count")
                    if isinstance(token_count, int):
                        return int(token_count)
                if isinstance(data, list):
                    return len(data)
            except Exception:
                continue

    # Fallback heuristic: ~4 chars per token (rough)
    return max(1, len(text) // 4)


def count_message_tokens(role: str, content: str) -> int:
    prefix = f"{role}: " if role else ""
    return count_tokens(prefix + (content or ""))
