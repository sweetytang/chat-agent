from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.runs import resume_run
from app.db.base import Base
from app.db.models import Checkpoint, Interrupt, InterruptStatus, Run, RunStatus, Thread, User
from app.modules.runs.dependencies import run_dependencies_manager
from app.modules.runs.schemas import PendingReview, ResumeRequest, RunContext, RunRequest


class AsyncSessionAdapter:
    """用同步 SQLite 提供确定性的 ORM identity-map/分离对象测试。"""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.execute_count = 0

    def add(self, instance) -> None:
        self.session.add(instance)

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


@pytest.mark.asyncio
async def test_resume_persists_tool_result_and_messages_to_db() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    user_id, run_id, thread_id, checkpoint_id = uuid4(), uuid4(), uuid4(), uuid4()
    interrupt_id = uuid4()
    request_id = "test-resume-req"
    tool_call_id = "test-tool-call"
    timeline = {
        "version": 1,
        "items": [
            {
                "id": "user-message",
                "kind": "message",
                "run_id": str(run_id),
                "sequence": 0,
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
            email="test@example.com",
            password_hash="test-password-hash",
        )
        thread = Thread(id=thread_id, user_id=user_id, title="测试线程")
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
                    status=InterruptStatus.PENDING,
                ),
            ]
        )
        original_session.commit()
        run_context = RunContext(checkpoint=checkpoint)

    request = RunRequest(thread_id=str(thread_id), content="search: LangGraph")
    pending = PendingReview(
        str(run_id),
        request,
        run_context,
        persisted=True,
        tool_call_id=tool_call_id,
    )
    run_dependencies = run_dependencies_manager.configure_run_dependencies()
    run_coordination = run_dependencies.run_coordination
    run_coordination.register_pending_review(request_id, pending)

    with Session(engine, expire_on_commit=False) as resumed_session:
        session_adapter = AsyncSessionAdapter(resumed_session)
        response = await resume_run(
            str(run_id),
            ResumeRequest(request_id=request_id, decision="approve"),
            subject=str(user_id),
            session=session_adapter,
        )
        events = [event async for event in response.body_iterator]

    # 1. 验证流式事件回传前端
    assert any('"event":"tool.result"' in event for event in events)
    assert any('"event":"run.completed"' in event for event in events)

    # 2. 验证最后数据库持久化落库
    with Session(engine) as reloaded_session:
        reloaded_checkpoint = reloaded_session.get(Checkpoint, checkpoint_id)
        assert reloaded_checkpoint is not None
        items = reloaded_checkpoint.state["timeline"]["items"]
        persisted_tool = next(item for item in items if item["id"] == tool_call_id)
        assert persisted_tool["status"] == "completed", (
            f"tool status in db is {persisted_tool['status']}"
        )
        assert persisted_tool["result"] is not None
        assert any(
            item["kind"] == "message"
            and item["role"] == "assistant"
            and item["status"] == "completed"
            for item in items
        ), f"assistant message not in db: {items}"
        assert reloaded_session.get(Run, run_id).status is RunStatus.COMPLETED
        assert reloaded_session.get(Interrupt, interrupt_id).status is InterruptStatus.RESUMED


@pytest.mark.asyncio
async def test_generate_resumed_run_events_directly_persists_detached_checkpoint() -> None:
    from app.modules.runs.resume import generate_resumed_run_events

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    user_id, run_id, thread_id, checkpoint_id = uuid4(), uuid4(), uuid4(), uuid4()
    interrupt_id = uuid4()
    request_id = "test-direct-req"
    tool_call_id = "test-direct-tool-call"
    timeline = {
        "version": 1,
        "items": [
            {
                "id": "user-message",
                "kind": "message",
                "run_id": str(run_id),
                "sequence": 0,
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
            email="direct@example.com",
            password_hash="test-password-hash",
        )
        thread = Thread(id=thread_id, user_id=user_id, title="直接恢复测试")
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
                    status=InterruptStatus.PENDING,
                ),
            ]
        )
        original_session.commit()
        # 模拟完全 detached 的 checkpoint
        run_context = RunContext(checkpoint=checkpoint)

    request = RunRequest(thread_id=str(thread_id), content="search: LangGraph")
    pending = PendingReview(
        str(run_id),
        request,
        run_context,
        persisted=True,
        tool_call_id=tool_call_id,
    )
    run_dependencies_manager.configure_run_dependencies()

    with Session(engine, expire_on_commit=False) as resumed_session:
        session_adapter = AsyncSessionAdapter(resumed_session)
        events = [
            event
            async for event in generate_resumed_run_events(
                ResumeRequest(request_id=request_id, decision="approve"),
                pending,
                session=session_adapter,
            )
        ]

    assert any('"event":"tool.result"' in event for event in events)
    assert any('"event":"run.completed"' in event for event in events)

    with Session(engine) as reloaded_session:
        reloaded_checkpoint = reloaded_session.get(Checkpoint, checkpoint_id)
        assert reloaded_checkpoint is not None
        items = reloaded_checkpoint.state["timeline"]["items"]
        persisted_tool = next(item for item in items if item["id"] == tool_call_id)
        assert persisted_tool["status"] == "completed"
        assert persisted_tool["result"] is not None
        assert reloaded_session.get(Run, run_id).status is RunStatus.COMPLETED


@pytest.mark.asyncio
async def test_resume_handles_consecutive_approval_interrupt() -> None:
    from app.integrations.llm.fake import FakeChatModel
    from app.modules.mcp.agent import McpToolSnapshot
    from app.modules.mcp.schemas import ToolIdentity
    from app.modules.runs.resume import generate_resumed_run_events

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    user_id, run_id, thread_id, checkpoint_id = uuid4(), uuid4(), uuid4(), uuid4()
    interrupt_id = uuid4()
    request_id = "test-first-req"
    tool_call_id = "test-first-call"
    timeline = {
        "version": 1,
        "items": [
            {
                "id": "user-message",
                "kind": "message",
                "run_id": str(run_id),
                "sequence": 0,
                "logical_message_id": "user-message",
                "role": "user",
                "content": "执行多个工具",
                "status": "completed",
                "terminal_segment": True,
            },
            {
                "id": tool_call_id,
                "kind": "tool",
                "run_id": str(run_id),
                "sequence": 1,
                "tool": "first_tool",
                "arguments": {},
                "request_id": request_id,
                "result": None,
                "status": "awaiting_approval",
            },
        ],
    }

    with Session(engine, expire_on_commit=False) as s:
        s.add_all(
            [
                User(id=user_id, email="chain@test.com", password_hash="hash"),
                Thread(id=thread_id, user_id=user_id, title="连续审批测试"),
                Checkpoint(
                    id=checkpoint_id, thread_id=thread_id, state={"timeline": deepcopy(timeline)}
                ),
                Run(id=run_id, thread_id=thread_id, status=RunStatus.INTERRUPTED),
                Interrupt(
                    id=interrupt_id,
                    run_id=run_id,
                    checkpoint_id=checkpoint_id,
                    request_id=request_id,
                    kind="mcp_tool",
                    payload={"tool": "first_tool", "tool_call_id": tool_call_id},
                    status=InterruptStatus.PENDING,
                ),
            ]
        )
        s.commit()
        run_context = RunContext(checkpoint=s.get(Checkpoint, checkpoint_id))

    # 构造第一个工具的快照
    async def first_caller(ident, args):
        return {"output": "first done"}

    first_snapshot = McpToolSnapshot(
        identity=ToolIdentity("server-1", "first_tool", "first_tool"),
        description="first tool",
        input_schema={"type": "object"},
        security_version=1,
        caller=first_caller,
    )

    # 模拟模型在收到第一个工具结果后，决定触发调用第二个需要审批的工具
    run_dependencies = run_dependencies_manager.configure_run_dependencies()
    fake_model = FakeChatModel(
        chunks=[],
        tool_calls=[{"name": "first_tool", "args": {"step": "next"}, "id": "second-call"}],
    )
    from dataclasses import replace

    run_dependencies_manager.configure_run_dependencies(
        replace(run_dependencies, fake_chat_model=lambda **_: fake_model)
    )

    pending = PendingReview(
        str(run_id),
        RunRequest(thread_id=str(thread_id), content="执行多个工具"),
        run_context,
        persisted=True,
        mcp_snapshot=first_snapshot,
        tool_call_id=tool_call_id,
    )

    with Session(engine, expire_on_commit=False) as resumed_session:
        events = [
            event
            async for event in generate_resumed_run_events(
                ResumeRequest(request_id=request_id, decision="approve"),
                pending,
                session=AsyncSessionAdapter(resumed_session),
            )
        ]

    # 验证：产生 tool.result -> 产生第二次 tool.call -> 产生 tool.approval_required 并且流挂起退出
    assert any('"event":"tool.result"' in e for e in events)
    assert any('"event":"tool.approval_required"' in e for e in events)
    assert not any('"event":"run.completed"' in e for e in events)

    # 验证数据库状态保持在 INTERRUPTED，且产生了新的 Interrupt 记录
    with Session(engine) as verify_session:
        db_run = verify_session.get(Run, run_id)
        assert db_run.status == RunStatus.INTERRUPTED
        items = verify_session.get(Checkpoint, checkpoint_id).state["timeline"]["items"]
        assert any(
            item["id"] == "second-call" and item["status"] == "awaiting_approval" for item in items
        )
