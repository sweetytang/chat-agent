from __future__ import annotations

from copy import deepcopy
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from ..recorder import TimelineRecorder


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


def extract_conversation_messages(snapshot: TimelineSnapshot) -> list[dict[str, str]]:
    """从时间线派生模型上下文，同一 logical message 的文本段合并。"""

    grouped: list[dict[str, str]] = []
    indexes: dict[tuple[str, str], int] = {}
    for item in validate_timeline(snapshot)["items"]:
        if item.get("kind") != "message" or item.get("role") not in {"user", "assistant"}:
            continue
        role = str(item["role"])
        logical_id = item.get("logical_message_id") or str(item.get("id"))
        key = (role, logical_id)
        if key not in indexes:
            indexes[key] = len(grouped)
            grouped.append({"role": role, "content": ""})
        grouped[indexes[key]]["content"] += item.get("content")
    return grouped


def get_latest_user_content(snapshot: TimelineSnapshot, fallback: str = "") -> str:
    for message in reversed(extract_conversation_messages(snapshot)):
        if message["role"] == "user":
            return message["content"]
    return fallback


def get_next_sequence(recorder: TimelineRecorder) -> int:
    return max((int(item.get("sequence", -1)) for item in recorder.snapshot["items"]), default=-1) + 1
