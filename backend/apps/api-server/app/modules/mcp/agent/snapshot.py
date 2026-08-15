"""run 级 MCP 工具快照，确保配置变化不影响进行中的运行。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.modules.mcp.agent.tools import McpToolSnapshot


@dataclass(frozen=True)
class McpRunSnapshot:
    security_version: int
    tools: tuple[McpToolSnapshot, ...]

    def compatible_with(self, security_version: int) -> bool:
        return self.security_version == security_version

    def require_current(self, security_version: int) -> None:
        if not self.compatible_with(security_version):
            raise ValueError("MCP 安全版本已变化，审核请求已失效")


def freeze_snapshot(security_version: int, tools: list[McpToolSnapshot]) -> McpRunSnapshot:
    return McpRunSnapshot(security_version=security_version, tools=tuple(tools))


def snapshot_metadata(snapshot: McpRunSnapshot) -> dict[str, Any]:
    return {
        "security_version": snapshot.security_version,
        "tools": [tool.identity.internal_name for tool in snapshot.tools if tool.enabled],
    }
