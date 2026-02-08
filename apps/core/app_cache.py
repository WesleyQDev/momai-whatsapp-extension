import time
from typing import Any

_CACHE: dict[str, dict[str, Any]] = {
    "latest_llama": {"value": None, "ts": 0.0},
    "extensions_registry": {"value": None, "ts": 0.0},
    "extensions_list": {"value": None, "ts": 0.0}
}


def get_cached(key: str, ttl_seconds: int):
    entry = _CACHE.get(key)
    if not entry:
        return None
    age = time.monotonic() - entry["ts"]
    if entry["value"] is None or age > ttl_seconds:
        return None
    return entry["value"]


def set_cache(key: str, value: Any) -> None:
    if key in _CACHE:
        _CACHE[key]["value"] = value
        _CACHE[key]["ts"] = time.monotonic()


def clear_cache(keys: list[str]) -> None:
    for key in keys:
        if key in _CACHE:
            _CACHE[key]["value"] = None
            _CACHE[key]["ts"] = 0.0
