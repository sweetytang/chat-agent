from __future__ import annotations

from copy import deepcopy
from typing import Any

type TimelineItem = dict[str, Any]
type TimelineSnapshot = dict[str, Any]


def empty_timeline() -> TimelineSnapshot:
    return {"version": 1, "items": []}


def validate_timeline(value: object) -> TimelineSnapshot:
    """在持久化边界严格拒绝旧 messages checkpoint。"""

    if not isinstance(value, dict) or value.get("version") != 1:
        raise ValueError("checkpoint 不是 timeline v1")
    items = value.get("items")
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ValueError("checkpoint timeline items 无效")
    return deepcopy(value)


def checkpoint_timeline(checkpoint: object) -> TimelineSnapshot:
    """从Checkpoint读取校验过的timeline字段"""

    state = checkpoint.state if hasattr(checkpoint, "state") else checkpoint
    if not isinstance(state, dict) or set(state) != {"timeline"}:
        raise ValueError("checkpoint state 不是 timeline 单一事实来源")
    return validate_timeline(state["timeline"])


__all__ = [
    "TimelineSnapshot",
    "empty_timeline",
    "validate_timeline",
    "checkpoint_timeline"
]