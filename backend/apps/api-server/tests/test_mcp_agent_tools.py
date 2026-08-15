from typing import Any

import pytest

from app.modules.mcp.agent import McpToolSnapshot, build_langchain_tools
from app.modules.mcp.agent.runtime import clean_mcp_arguments
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
            McpToolSnapshot(
                ToolIdentity("srv", "disabled", "mcp__srv__disabled"), "", {}, caller, False
            ),
        ]
    )
    assert [tool.name for tool in tools] == ["mcp__srv__create_issue"]
    assert "远端工具=create_issue" in tools[0].description
    assert "内部调用名=mcp__srv__create_issue" in tools[0].description
    assert await tools[0].ainvoke({"title": "bug"}) == "ok"
    assert calls == [("create_issue", {"title": "bug"})]


@pytest.mark.asyncio
async def test_snapshot_caller_omits_empty_optional_arguments() -> None:
    calls: list[dict[str, Any]] = []

    async def caller(identity: ToolIdentity, arguments: dict[str, Any]) -> str:
        calls.append(arguments)
        return identity.remote_name

    assert clean_mcp_arguments({"method": "create", "type": "", "title": "x"}) == {
        "method": "create",
        "title": "x",
    }


def test_clean_mcp_arguments_omits_optional_numeric_zero() -> None:
    schema = {
        "type": "object",
        "properties": {
            "milestone": {"type": "number"},
            "title": {"type": "string"},
        },
        "required": ["title"],
    }
    assert clean_mcp_arguments({"milestone": 0, "title": "官方github mcp测试"}, schema) == {
        "title": "官方github mcp测试"
    }
