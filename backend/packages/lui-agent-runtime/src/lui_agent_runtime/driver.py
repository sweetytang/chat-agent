"""Agent 执行驱动的最小协议。

业务编排只依赖 ``AgentDriver``，LangGraph 只是当前默认实现。
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from .events import RuntimeEvent


class AgentDriver(Protocol):
    def stream(
        self,
        model: Any,
        messages: Sequence[Any],
        *,
        run_id: str,
        thread_id: str,
        tools: Sequence[Any] = (),
        continue_after_tools: bool = False,
        approval_tool_names: frozenset[str] = frozenset(),
    ) -> AsyncIterator[RuntimeEvent]: ...


@dataclass(frozen=True)
class LangGraphAgentDriver:
    """把现有 LangGraph 事件流适配为 AgentDriver。"""

    stream_graph_events: Callable[..., AsyncIterator[RuntimeEvent]]

    def stream(
        self,
        model: Any,
        messages: Sequence[Any],
        *,
        run_id: str,
        thread_id: str,
        tools: Sequence[Any] = (),
        continue_after_tools: bool = False,
        approval_tool_names: frozenset[str] = frozenset(),
    ) -> AsyncIterator[RuntimeEvent]:
        return self.stream_graph_events(
            model,
            messages,
            run_id=run_id,
            thread_id=thread_id,
            tools=tools,
            continue_after_tools=continue_after_tools,
            approval_tool_names=approval_tool_names,
        )
