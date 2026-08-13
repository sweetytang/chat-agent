from app.modules.mcp.agent import freeze_snapshot, normalize_tool_result, snapshot_metadata
from app.modules.mcp.agent.tools import McpToolSnapshot
from app.modules.mcp.naming import ToolIdentity


async def _caller(identity, arguments):
    return identity.remote_name


def test_run_snapshot_freezes_tools_and_security_version() -> None:
    tool = McpToolSnapshot(ToolIdentity("srv", "read", "mcp__srv__read"), "read", {}, _caller)
    snapshot = freeze_snapshot(3, [tool])
    assert snapshot.compatible_with(3)
    assert not snapshot.compatible_with(4)
    assert snapshot_metadata(snapshot) == {"security_version": 3, "tools": ["mcp__srv__read"]}


def test_normalize_mcp_content_blocks_and_unknowns() -> None:
    result = normalize_tool_result({"content": [{"type": "text", "text": "ok"}, {"type": "sampling"}]})
    assert result["kind"] == "content_blocks"
    assert result["content"][1]["type"] == "unsupported"
