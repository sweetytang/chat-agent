"""MCP 工具到 LangChain 的边界适配。

Graph 只接收 LangChain 工具，不直接依赖 MCP SDK。调用端由 Host 注入，
因此 run 可以冻结本模块产生的快照，配置变化不会影响已经创建的 run。
"""

from __future__ import annotations

from collections.abc import Awaitable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.tools import StructuredTool

from app.modules.mcp.naming import ToolIdentity


class McpToolCaller(Protocol):
    def __call__(self, identity: ToolIdentity, arguments: dict[str, Any]) -> Awaitable[Any]: ...


@dataclass(frozen=True)
class McpToolSnapshot:
    """run 创建时冻结的最小工具定义。"""

    identity: ToolIdentity
    description: str
    input_schema: Mapping[str, Any]
    caller: McpToolCaller
    enabled: bool = True
    security_version: int = 1


def build_langchain_tools(snapshots: Sequence[McpToolSnapshot]) -> list[StructuredTool]:
    """仅将启用的快照转换为 LangChain StructuredTool。"""

    tools: list[StructuredTool] = []
    for snapshot in snapshots:
        if not snapshot.enabled:
            continue

        async def invoke(
            snapshot: McpToolSnapshot = snapshot,
            **arguments: Any,
        ) -> Any:
            return await snapshot.caller(snapshot.identity, arguments)

        tools.append(
            StructuredTool.from_function(
                coroutine=invoke,
                name=snapshot.identity.internal_name,
                description=snapshot.description or snapshot.identity.remote_name,
                args_schema=dict(snapshot.input_schema),
            )
        )
    return tools
