import pytest

from app.api.runs import PendingReview, RunRequest, resumed_run_events, safe_resumed_run_events
from app.modules.mcp.agent import freeze_snapshot, normalize_tool_result, snapshot_metadata
from app.modules.mcp.agent.tools import McpToolSnapshot
from app.modules.mcp.host import McpHostError
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
    result = normalize_tool_result(
        {"content": [{"type": "text", "text": "ok"}, {"type": "sampling"}]}
    )
    assert result["kind"] == "content_blocks"
    assert result["content"][1]["type"] == "unsupported"


@pytest.mark.asyncio
async def test_resumed_mcp_failure_is_emitted_as_failed_event() -> None:
    async def failing_caller(_identity, _arguments):
        raise McpHostError("MCP 操作失败（连接错误）")

    identity = ToolIdentity("srv", "tat_search", "mcp__srv__tat_search")
    pending = PendingReview(
        run_id="run-1",
        request=RunRequest(thread_id="thread-1", content="查询 MCP"),
        branch_context=None,
        mcp_snapshot=McpToolSnapshot(identity, "搜索", {}, failing_caller),
        arguments={"query": "MCP"},
    )

    events = [
        event
        async for event in resumed_run_events(
            "run-1",
            pending.request,
            "request-1",
            "approve",
            None,
            None,
            pending=pending,
        )
    ]

    assert any("run.failed" in event for event in events)
    assert not any("run.completed" in event for event in events)


@pytest.mark.asyncio
async def test_resumed_mcp_success_generates_final_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api import runs

    class Model:
        async def ainvoke(self, messages):
            assert len(messages) == 2
            assert "MCP 工具返回结果" in messages[1].content
            return type("Reply", (), {"content": "仓库的基本信息已整理。"})()

    monkeypatch.setattr(
        runs, "get_provider_config", lambda: type("Provider", (), {"provider": "fake"})()
    )
    monkeypatch.setattr(runs, "FakeChatModel", lambda **_kwargs: Model())

    async def caller(_identity, _arguments):
        return {"content": [{"type": "text", "text": '{"name":"open-agent-mcp-e2e"}'}]}

    identity = ToolIdentity("srv", "search_repo", "mcp__srv__search_repo")
    pending = PendingReview(
        "run-2",
        RunRequest(thread_id="thread-2", content="查询仓库信息"),
        None,
        mcp_snapshot=McpToolSnapshot(identity, "搜索仓库", {}, caller),
    )
    events = [
        event
        async for event in resumed_run_events(
            "run-2", pending.request, "request-2", "approve", None, None, pending=pending
        )
    ]
    assert any("仓库的基本信息已整理" in event for event in events)
    assert not any("生成最终答复失败" in event for event in events)


@pytest.mark.asyncio
async def test_safe_resumed_events_converts_unexpected_exception_to_failed_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken(*_args, **_kwargs):
        raise RuntimeError("stream broke")
        yield "never"

    from app.api import runs

    monkeypatch.setattr(runs, "resumed_run_events", broken)
    request = RunRequest(thread_id="thread-3", content="查询 MCP")
    events = [
        event
        async for event in safe_resumed_run_events(
            "run-3", request, "request-3", "approve", None, None
        )
    ]

    assert any('"event":"run.failed"' in event for event in events)
