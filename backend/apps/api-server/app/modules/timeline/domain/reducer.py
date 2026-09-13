from __future__ import annotations

from copy import deepcopy
from typing import Any

from . import validate_timeline, TimelineSnapshot
from lui_agent_runtime.events import RuntimeEvent


def _text(value: object, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def _item_id(event: RuntimeEvent, field: str = "item_id") -> str:
    value = event.data.get(field)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{event.event} 缺少稳定 {field}")
    return value


def _replace(items: list[dict[str, Any]], item_id: str, update: dict[str, Any]) -> bool:
    for index, item in enumerate(items):
        if item.get("id") == item_id:
            items[index] = {**item, **update}
            return True
    return False


def _append_error(items: list[dict[str, Any]], event: RuntimeEvent, message: str) -> None:
    item_id = event.data.get("item_id")
    if not isinstance(item_id, str) or not item_id:
        item_id = f"{event.run_id}:error:{event.sequence}"
    # 执行锁
    if any(item.get("id") == item_id for item in items):
        return
    items.append(
        {
            "id": item_id,
            "kind": "error",
            "run_id": event.run_id,
            "sequence": event.sequence,
            "status": "failed",
            "message": message,
        }
    )


def _fail_unfinished_items(items: list[dict[str, Any]], run_id: str) -> None:
    """失败事件是运行终态，不能让时间线中的旧条目继续显示为生成中。"""

    unfinished = {"streaming", "running", "awaiting_approval"}
    for index, item in enumerate(items):
        if item.get("run_id") == run_id and item.get("status") in unfinished:
            items[index] = {**item, "status": "failed"}


def reduce_timeline(snapshot: TimelineSnapshot, event: RuntimeEvent) -> TimelineSnapshot:
    """把一个业务事件纯投影为新快照；条目只原地更新，不改变首次插入位置。"""

    result = validate_timeline(snapshot)
    items: list[dict[str, Any]] = result["items"]
    data = event.data

    if event.event == "message.started":
        item_id = _item_id(event)
        logical_id = _item_id(event, "message_id")
        for index, item in enumerate(items):
            if item.get("kind") == "message" and item.get("logical_message_id") == logical_id:
                items[index] = {**item, "terminal_segment": False}
        if not any(item.get("id") == item_id for item in items):
            items.append(
                {
                    "id": item_id,
                    "kind": "message",
                    "run_id": event.run_id,
                    "sequence": event.sequence,
                    "logical_message_id": logical_id,
                    "role": _text(data.get("role"), "assistant"),
                    "content": "",
                    "status": "streaming",
                    "terminal_segment": True,
                }
            )
    elif event.event == "message.delta":
        item_id = _item_id(event)
        target = next((item for item in items if item.get("id") == item_id), None)
        if target is None:
            raise ValueError("message.delta 目标不存在")
        _replace(
            items, item_id, {"content": _text(target.get("content")) + _text(data.get("content"))}
        )
    elif event.event == "message.completed":
        item_id = _item_id(event)
        if not _replace(items, item_id, {"status": "completed", "terminal_segment": True}):
            raise ValueError("message.completed 目标不存在")
    elif event.event == "reasoning.delta":
        item_id = _item_id(event)
        target = next((item for item in items if item.get("id") == item_id), None)
        if target is None:
            items.append(
                {
                    "id": item_id,
                    "kind": "reasoning",
                    "run_id": event.run_id,
                    "sequence": event.sequence,
                    "content": _text(data.get("content")),
                    "status": "streaming",
                }
            )
        else:
            _replace(
                items,
                item_id,
                {"content": _text(target.get("content")) + _text(data.get("content"))},
            )
    elif event.event == "reasoning.completed":
        item_id = _item_id(event)
        if not _replace(items, item_id, {"status": "completed"}):
            raise ValueError("reasoning.completed 目标不存在")
    elif event.event == "tool.call":
        item_id = _item_id(event, "tool_call_id")
        tool = {
            "id": item_id,
            "kind": "tool",
            "run_id": event.run_id,
            "sequence": event.sequence,
            "tool": _text(data.get("tool"), "tool"),
            "arguments": deepcopy(data.get("arguments", {})),
            "status": "running",
            "request_id": data.get("request_id"),
            "result": None,
        }
        if not _replace(items, item_id, tool):
            items.append(tool)
    elif event.event == "tool.approval_required":
        item_id = _item_id(event, "tool_call_id")
        if not _replace(
            items,
            item_id,
            {"status": "awaiting_approval", "request_id": data.get("request_id")},
        ):
            raise ValueError("tool.approval_required 目标不存在")
    elif event.event == "tool.result":
        item_id = _item_id(event, "tool_call_id")
        content = deepcopy(data.get("content"))
        failed = isinstance(content, dict) and "error" in content
        if not _replace(
            items,
            item_id,
            {"status": "failed" if failed else "completed", "result": content},
        ):
            _append_error(items, event, f"工具结果找不到调用：{item_id}")
    elif event.event in {"structured_output.delta", "generative_ui.delta"}:
        item_id = _item_id(event)
        kind = "structured_output" if event.event.startswith("structured") else "generative_ui"
        value = deepcopy(data.get("value", data))
        update = {"value": value, "status": "streaming"}
        if not _replace(items, item_id, update):
            items.append(
                {
                    "id": item_id,
                    "kind": kind,
                    "run_id": event.run_id,
                    "sequence": event.sequence,
                    **update,
                }
            )
    elif event.event in {"run.failed", "mcp.error"}:
        _fail_unfinished_items(items, event.run_id)
        _append_error(
            items,
            event,
            _text(
                data.get("error"), "MCP 工具加载失败" if event.event == "mcp.error" else "运行失败"
            ),
        )
    elif event.event in {"run.cancelled", "run.completed"}:
        status = "cancelled" if event.event == "run.cancelled" else "completed"
        for index, item in enumerate(items):
            unfinished = {"streaming"}
            if event.event == "run.cancelled":
                unfinished.update({"running", "awaiting_approval"})
            if item.get("run_id") == event.run_id and item.get("status") in unfinished:
                items[index] = {**item, "status": status}

    return result

