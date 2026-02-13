import re
from typing import Iterable

from database.vector_db import vector_db
from tools.system_actions import get_all_tools_registry


def _normalize_tokens(text: str) -> set[str]:
    if not text:
        return set()
    return set(re.findall(r"[a-zA-Z0-9_]{2,}", text.lower()))


def _lexical_score(query_tokens: set[str], name: str, description: str) -> float:
    if not query_tokens:
        return 0.0

    name_tokens = _normalize_tokens(name)
    desc_tokens = _normalize_tokens(description)

    score = 0.0
    score += len(query_tokens & name_tokens) * 3.0
    score += len(query_tokens & desc_tokens) * 1.0

    lowered_name = (name or "").lower()
    for tok in query_tokens:
        if tok and tok in lowered_name:
            score += 0.2

    return score


def _unique_keep_order(items: Iterable[str]) -> list[str]:
    seen = set()
    ordered = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


async def select_tool_names_for_query(
    query: str,
    limit: int = 8,
    seed_names: list[str] | None = None,
    include_names: list[str] | None = None,
) -> list[str]:
    registry = get_all_tools_registry()
    if not registry:
        return []

    selected: list[str] = []

    for name in _unique_keep_order(seed_names or []):
        if name in registry:
            selected.append(name)

    try:
        vector_hits = await vector_db.search_tools(query, limit=max(limit * 3, 12))
    except Exception:
        vector_hits = []

    for item in vector_hits:
        name = item.get("name")
        if name in registry and name not in selected:
            selected.append(name)
        if len(selected) >= limit:
            break

    if len(selected) < limit:
        q_tokens = _normalize_tokens(query)
        scored: list[tuple[float, str]] = []
        for name, tool in registry.items():
            if name in selected:
                continue
            description = getattr(tool, "description", "") or ""
            score = _lexical_score(q_tokens, name, description)
            if score > 0:
                scored.append((score, name))

        scored.sort(key=lambda x: x[0], reverse=True)
        for _score, name in scored:
            selected.append(name)
            if len(selected) >= limit:
                break

    for name in _unique_keep_order(include_names or []):
        if name in registry and name not in selected:
            selected.append(name)

    return selected[:limit]
