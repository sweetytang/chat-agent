from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage

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


def timeline_to_model_messages(snapshot: TimelineSnapshot) -> list[BaseMessage]:
    """将 Checkpoint 时间线完整还原为 LangChain/OpenAI 对话消息序列。

    规则：
    1. 连续的同角色流式消息自动合并；
    2. 工具调用必须转化为带 tool_calls 的 AIMessage + 后续对应的 ToolMessage；
    3. 过滤 reasoning、generative_ui 等纯前端渲染噪音；
    4. 对历史长工具输出做适当截断，保护上下文窗口。
    """
    messages: list[BaseMessage] = []
    items = validate_timeline(snapshot)["items"]

    current_role: str | None = None
    current_content: str = ""

    def flush_message():
        nonlocal current_role, current_content
        if current_role and current_content:
            if current_role == "user":
                messages.append(HumanMessage(content=current_content))
            elif current_role == "assistant":
                messages.append(AIMessage(content=current_content))
            elif current_role == "system":
                messages.append(SystemMessage(content=current_content))
        current_role = None
        current_content = ""

    for item in items:
        kind = item.get("kind")

        # 1. 普通对话消息
        if kind == "message":
            role = item.get("role")
            if role in {"user", "assistant", "system"}:
                if role != current_role:
                    flush_message()
                    current_role = role
                current_content += item.get("content", "")

        # 2. 完整的工具调用闭环
        elif kind == "tool":
            flush_message()
            tool_name = item.get("tool", "")
            tool_call_id = item.get("id", "")
            arguments = item.get("arguments", {})
            result = item.get("result")

            # 必须先有 AIMessage 记录模型发起的工具调用
            messages.append(
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": tool_name,
                            "args": arguments,
                            "id": tool_call_id,
                        }
                    ],
                )
            )

            # 只要工具已有结果（不管是成功还是 error），就必须紧跟 ToolMessage
            if result is not None:
                text_content = (
                    json.dumps(result, ensure_ascii=False)
                    if isinstance(result, (dict, list))
                    else str(result)
                )
                # 超过 4000 字符的历史输出进行安全截断，防止爆 Token
                if len(text_content) > 4000:
                    text_content = text_content[:4000] + "\n...[历史输出已截断]..."

                messages.append(
                    ToolMessage(
                        content=text_content,
                        tool_call_id=tool_call_id,
                    )
                )

    flush_message()
    return messages
