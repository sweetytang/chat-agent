"""运行流程依赖。

运行模块只依赖这组小接口，不再反向导入 HTTP 路由模块。API 层在装配路由
时提供当前进程实现，后续可以把同一组依赖替换成 worker/队列实现。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from app.integrations.llm.config import get_provider_config
from app.integrations.llm.factory import create_chat_model
from app.integrations.llm.fake import FakeChatModel
from app.modules.mcp.dependencies import get_mcp_host
from app.modules.mcp.host.client import McpHost
from lui_agent_runtime.driver import AgentDriver, LangGraphAgentDriver
from lui_agent_runtime.events import RuntimeEvent
from lui_agent_runtime.graph.runtime import stream_graph_events
from lui_agent_runtime.tools.langchain import default_langchain_tools
from lui_agent_runtime.tools.registry import calculate

from .coordination import RunCoordination, run_coordination
from .domain import build_event


@dataclass(frozen=True)
class RunDependencies:
    """运行编排需要的最小外部能力集合。"""

    run_coordination: RunCoordination
    event_factory: Callable[..., RuntimeEvent]
    get_mcp_host: Callable[..., McpHost]
    calculate: Callable[[str], float]
    get_provider_config: Callable[[], Any]
    create_chat_model: Callable[[Any], Any]
    fake_chat_model: Callable[..., Any]
    default_langchain_tools: Callable[[], Sequence[Any]]
    agent_driver: Callable[[], AgentDriver]


def build_run_dependencies() -> RunDependencies:
    """由 API 边界装配当前进程实现，运行模块不反向依赖路由。"""

    return RunDependencies(
        run_coordination=run_coordination,
        event_factory=build_event,
        get_mcp_host=get_mcp_host,
        calculate=calculate,
        get_provider_config=get_provider_config,
        create_chat_model=create_chat_model,
        fake_chat_model=FakeChatModel,
        default_langchain_tools=default_langchain_tools,
        agent_driver=lambda: LangGraphAgentDriver(stream_graph_events),
    )


class RunDependenciesManager:
    _configured: RunDependencies | None = None

    def configure_run_dependencies(self, dependencies: RunDependencies = None) -> RunDependencies:
        """设置当前进程的默认依赖，供兼容旧的直接调用方式。"""
        self._configured = dependencies if dependencies is not None else build_run_dependencies()
        return self._configured

    def get_run_dependencies(self) -> RunDependencies:
        if self._configured is None:
            raise RuntimeError("运行依赖尚未装配")
        return self._configured


run_dependencies_manager = RunDependenciesManager()
