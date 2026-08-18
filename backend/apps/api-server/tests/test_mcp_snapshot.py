from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.runs import (
    PendingReview,
    ResumeRequest,
    RunRequest,
    resumed_run_events,
    safe_resumed_run_events,
)
from app.db.base import Base
from app.db.models import Checkpoint, Interrupt, InterruptStatus, Run, RunStatus, Thread, User
from app.modules.checkpoints.service import RunBranchContext
from app.modules.mcp.agent import freeze_snapshot, normalize_tool_result, snapshot_metadata
from app.modules.mcp.agent.tools import McpToolSnapshot
from app.modules.mcp.host import McpHostError
from app.modules.mcp.naming import ToolIdentity


async def _caller(identity, arguments):
    return identity.remote_name


class AsyncSessionAdapter:
    """用同步 SQLite 提供确定性的 ORM identity-map/分离对象测试。"""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.execute_count = 0

    async def get(self, model, item_id):
        return self.session.get(model, item_id)

    async def execute(self, statement):
        self.execute_count += 1
        return self.session.execute(statement)

    async def flush(self) -> None:
        self.session.flush()

    async def commit(self) -> None:
        self.session.commit()

    async def rollback(self) -> None:
        self.session.rollback()

    async def refresh(self, instance, attribute_names=None) -> None:
        self.session.refresh(instance, attribute_names=attribute_names)


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
async def test_resume_persists_tool_result_when_pending_checkpoint_is_detached() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    user_id, run_id, thread_id, checkpoint_id = uuid4(), uuid4(), uuid4(), uuid4()
    interrupt_id = uuid4()
    request_id = "detached-review"
    tool_call_id = "detached-tool-call"
    timeline = {
        "version": 1,
        "items": [
            {
                "id": "user-message",
                "kind": "message",
                "run_id": str(run_id),
                "sequence": -1,
                "logical_message_id": "user-message",
                "role": "user",
                "content": "search: LangGraph",
                "status": "completed",
                "terminal_segment": True,
            },
            {
                "id": tool_call_id,
                "kind": "tool",
                "run_id": str(run_id),
                "sequence": 1,
                "tool": "web_search",
                "arguments": {"query": "LangGraph"},
                "request_id": request_id,
                "result": None,
                "status": "awaiting_approval",
            },
        ],
    }

    with Session(engine, expire_on_commit=False) as original_session:
        user = User(
            id=user_id,
            email="detached-review@example.com",
            password_hash="test-password-hash",
        )
        thread = Thread(id=thread_id, user_id=user_id, title="审核恢复测试")
        checkpoint = Checkpoint(
            id=checkpoint_id,
            thread_id=thread_id,
            state={"timeline": deepcopy(timeline)},
        )
        original_session.add_all(
            [
                user,
                thread,
                checkpoint,
                Run(id=run_id, thread_id=thread_id, status=RunStatus.INTERRUPTED),
                Interrupt(
                    id=interrupt_id,
                    run_id=run_id,
                    checkpoint_id=checkpoint_id,
                    request_id=request_id,
                    kind="tool",
                    payload={"tool": "web_search", "tool_call_id": tool_call_id},
                    status=InterruptStatus.APPROVED,
                ),
            ]
        )
        original_session.commit()
        branch_context = RunBranchContext(checkpoint_id, deepcopy(timeline), checkpoint=checkpoint)

    request = RunRequest(thread_id=str(thread_id), content="search: LangGraph")
    pending = PendingReview(
        str(run_id),
        request,
        branch_context,
        persisted=True,
        tool_call_id=tool_call_id,
    )
    from app.api import runs

    runs._pending_reviews[request_id] = pending
    with Session(engine, expire_on_commit=False) as resumed_session:
        session_adapter = AsyncSessionAdapter(resumed_session)
        response = await runs.resume_run(
            str(run_id),
            ResumeRequest(request_id=request_id, decision="approve"),
            subject=str(user_id),
            session=session_adapter,
        )
        # PendingReview 已存在时，响应创建阶段只需一次 checkpoint 重绑定查询。
        assert session_adapter.execute_count == 1
        events = [event async for event in response.body_iterator]

    assert any('"event":"tool.result"' in event for event in events)
    assert any('"event":"run.completed"' in event for event in events)
    with Session(engine) as reloaded_session:
        reloaded = reloaded_session.get(Checkpoint, checkpoint_id)
        assert reloaded is not None
        persisted_tool = next(
            item for item in reloaded.state["timeline"]["items"] if item["id"] == tool_call_id
        )
        assert persisted_tool["status"] == "completed"
        assert persisted_tool["result"] is not None
        assert any(
            item["kind"] == "message"
            and item["role"] == "assistant"
            and item["status"] == "completed"
            for item in reloaded.state["timeline"]["items"]
        )
        assert reloaded_session.get(Run, run_id).status is RunStatus.COMPLETED
        assert reloaded_session.get(Interrupt, interrupt_id).status is InterruptStatus.RESUMED


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
