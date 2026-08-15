"""运行流程依赖。

运行模块只依赖这组小接口，不再反向导入 HTTP 路由模块。API 层在装配路由
时提供当前进程实现，后续可以把同一组依赖替换成 worker/队列实现。
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, MutableMapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from lui_agent_runtime.driver import AgentDriver
from lui_agent_runtime.events import BusinessEvent


class McpHostLike(Protocol):
    async def disconnect(self, server_id: str) -> None: ...


@dataclass(frozen=True)
class RunDependencies:
    """运行编排需要的最小外部能力集合。"""

    cancel_events: MutableMapping[str, asyncio.Event]
    thread_lock: Callable[[str], asyncio.Lock]
    event: Callable[..., BusinessEvent]
    pending_reviews: MutableMapping[str, Any]
    mcp_host: Callable[[], McpHostLike | None]
    calculate: Callable[[str], float]
    get_provider_config: Callable[[], Any]
    create_chat_model: Callable[[Any], Any]
    fake_chat_model: Callable[..., Any]
    default_langchain_tools: Callable[[], Sequence[Any]]
    agent_driver: Callable[[], AgentDriver]

    # 这些只读别名让现有编排代码保持小 diff；新代码应使用无下划线字段。
    @property
    def _cancel_events(self) -> MutableMapping[str, asyncio.Event]:
        return self.cancel_events

    @property
    def _thread_lock(self) -> Callable[[str], asyncio.Lock]:
        return self.thread_lock

    @property
    def _event(self) -> Callable[..., BusinessEvent]:
        return self.event

    @property
    def _pending_reviews(self) -> MutableMapping[str, Any]:
        return self.pending_reviews

    @property
    def _mcp_host(self) -> McpHostLike | None:
        return self.mcp_host()

    @property
    def stream_graph_events(self) -> Callable[..., Any]:
        return self.agent_driver().stream

    @property
    def FakeChatModel(self) -> Callable[..., Any]:
        return self.fake_chat_model


_configured: RunDependencies | None = None


def configure_run_dependencies(dependencies: RunDependencies) -> None:
    """设置当前进程的默认依赖，供兼容旧的直接调用方式。"""

    global _configured
    _configured = dependencies


def get_run_dependencies() -> RunDependencies:
    if _configured is None:
        raise RuntimeError("运行依赖尚未装配")
    return _configured
