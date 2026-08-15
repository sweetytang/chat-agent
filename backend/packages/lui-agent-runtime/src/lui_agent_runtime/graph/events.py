from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from lui_agent_runtime.events import BusinessEvent


async def stream_graph_events(
    graph: Any, thread_id: str, content: str
) -> AsyncIterator[BusinessEvent]:
    """把 LangGraph update 流转换为稳定的业务事件，不泄漏 graph 内部结构。"""
    run_id = str(uuid4())
    sequence = 0
    yield BusinessEvent(1, "run.started", run_id, thread_id, sequence, {})
    async for update in graph.astream(
        {"messages": [{"role": "user", "content": content}]}, stream_mode="updates"
    ):
        for node_update in update.values():
            for message in node_update.get("messages", []):
                sequence += 1
                text = getattr(message, "content", None) or message.get("content", "")
                yield BusinessEvent(
                    1, "message.delta", run_id, thread_id, sequence, {"content": text}
                )
    sequence += 1
    yield BusinessEvent(1, "run.completed", run_id, thread_id, sequence, {})
