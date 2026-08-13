from typing import Any

import pytest

from app.modules.mcp.agent import McpToolSnapshot, build_langchain_tools
from app.modules.mcp.naming import ToolIdentity


@pytest.mark.asyncio
async def test_snapshot_maps_only_enabled_tool_and_routes_identity() -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def caller(identity: ToolIdentity, arguments: dict[str, Any]) -> str:
        calls.append((identity.remote_name, arguments))
        return "ok"

    identity = ToolIdentity("srv", "create_issue", "mcp__srv__create_issue")
    tools = build_langchain_tools(
        [
            McpToolSnapshot(identity, "创建 issue", {"title": (str, ...)}, caller),
            McpToolSnapshot(ToolIdentity("srv", "disabled", "mcp__srv__disabled"), "", {}, caller, False),
        ]
    )
    assert [tool.name for tool in tools] == ["mcp__srv__create_issue"]
    assert await tools[0].ainvoke({"title": "bug"}) == "ok"
    assert calls == [("create_issue", {"title": "bug"})]
