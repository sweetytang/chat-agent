import asyncio
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.api import runs
from app.api.runs import RunBranchContext, RunRequest, _load_branch_base
from app.db.models import Checkpoint, Run, RunStatus
from app.modules.checkpoints import service
from app.modules.timeline.domain import empty_timeline


def message(item_id: str, role: str, content: str) -> dict:
    return {
        "id": item_id,
        "kind": "message",
        "run_id": "run-1",
        "sequence": 1,
        "logical_message_id": item_id,
        "role": role,
        "content": content,
        "status": "completed",
        "terminal_segment": True,
    }


def checkpoint(*, checkpoint_id, thread_id, parent_id, items):
    return Checkpoint(
        id=checkpoint_id,
        thread_id=thread_id,
        parent_id=parent_id,
        state={"timeline": {"version": 1, "items": items}},
    )


class FakePersistenceSession:
    def __init__(self, run: Run) -> None:
        self.run = run
        self.commits = 0

    async def get(self, model, item_id):
        return self.run if model is Run and item_id == self.run.id else None

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_explicit_null_checkpoint_means_root_branch() -> None:
    parent_checkpoint = await _load_branch_base(
        object(),
        SimpleNamespace(current_checkpoint_id=uuid4()),
        None,
        use_current_if_none=False,
    )

    assert parent_checkpoint is None


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["send", "edit"])
async def test_send_and_edit_create_user_then_agent_checkpoint(monkeypatch, mode) -> None:
    base_checkpoint = SimpleNamespace(id=uuid4(), state={"timeline": empty_timeline()})
    user_id, agent_id = uuid4(), uuid4()
    calls = []
    user_timeline = {"version": 1, "items": [message("user", "user", "新问题")]}
    user_checkpoint = SimpleNamespace(id=user_id, state={"timeline": user_timeline})
    agent_checkpoint = SimpleNamespace(id=agent_id, parent_id=user_id, state={"timeline": user_timeline})

    async def fake_user(_session, _thread, **kwargs):
        calls.append(("user", kwargs))
        return user_checkpoint

    async def fake_agent(_session, _thread, **kwargs):
        calls.append(("agent", kwargs))
        return agent_checkpoint

    monkeypatch.setattr(service, "_append_user_checkpoint", fake_user)
    monkeypatch.setattr(service, "_append_agent_checkpoint", fake_agent)
    context = await service.create_run_branch(
        object(),
        SimpleNamespace(),
        run_id=uuid4(),
        mode=mode,
        content="新问题",
        parent_checkpoint=base_checkpoint,
    )

    assert calls[0][1]["parent_checkpoint"] == base_checkpoint
    assert calls[1][1]["input_checkpoint"] == user_checkpoint
    assert context.checkpoint_id == agent_id
    assert context.input_checkpoint.id == user_id


@pytest.mark.asyncio
async def test_regenerate_creates_sibling_agent_without_new_user_checkpoint(monkeypatch) -> None:
    user_id, agent_id = uuid4(), uuid4()
    timeline = {"version": 1, "items": [message("user", "user", "原问题")]}
    user_checkpoint = SimpleNamespace(id=user_id, state={"timeline": timeline})
    agent_checkpoint = SimpleNamespace(id=agent_id, parent_id=user_id, state={"timeline": timeline})

    async def unexpected_user(*_args, **_kwargs):
        raise AssertionError("重新生成不应新增用户消息")

    async def fake_agent(_session, _thread, **kwargs):
        assert kwargs["input_checkpoint"] == user_checkpoint
        return agent_checkpoint

    monkeypatch.setattr(service, "_append_user_checkpoint", unexpected_user)
    monkeypatch.setattr(service, "_append_agent_checkpoint", fake_agent)
    context = await service.create_run_branch(
        object(),
        SimpleNamespace(),
        run_id=uuid4(),
        mode="regenerate",
        content="原问题",
        parent_checkpoint=user_checkpoint,
    )

    assert context.checkpoint_id == agent_id
    assert context.input_checkpoint == user_checkpoint


@pytest.mark.asyncio
async def test_prepare_regenerate_rejects_non_user_checkpoint(monkeypatch) -> None:
    async def fake_load_branch_base(*_args, **_kwargs):
        return SimpleNamespace(id=uuid4(), state={"timeline": {"version": 1, "items": [message("assistant", "assistant", "旧回复")]}})

    monkeypatch.setattr(runs, "_load_branch_base", fake_load_branch_base)
    with pytest.raises(HTTPException) as raised:
        await runs._prepare_persisted_run(
            object(),
            uuid4(),
            RunRequest(
                thread_id=str(uuid4()),
                content="重新生成",
                checkpoint_id=uuid4(),
                mode="regenerate",
            ),
            SimpleNamespace(id=uuid4()),
        )
    assert raised.value.status_code == 400


@pytest.mark.asyncio
async def test_run_passes_complete_timeline_context_to_graph(monkeypatch) -> None:
    run_id = str(uuid4())
    captured_messages = []
    timeline = {
        "version": 1,
        "items": [
            message("u1", "user", "第一问"),
            message("a1", "assistant", "第一答"),
            message("u2", "user", "第二问"),
        ],
    }

    async def capture_graph(_model, messages, **_kwargs):
        captured_messages.extend(messages)
        if False:
            yield None

    monkeypatch.setattr(runs, "stream_graph_events", capture_graph)
    monkeypatch.setattr(runs, "get_provider_config", lambda: SimpleNamespace(provider="fake"))
    runs._cancel_events[run_id] = asyncio.Event()

    _ = [
        event
        async for event in runs.run_events(
            run_id,
            RunRequest(thread_id="timeline-thread", content="第二问"),
            branch_context=RunBranchContext(uuid4(), timeline),
        )
    ]

    assert captured_messages == [
        {"role": "user", "content": "第一问"},
        {"role": "assistant", "content": "第一答"},
        {"role": "user", "content": "第二问"},
    ]


@pytest.mark.asyncio
async def test_approval_card_is_committed_before_first_tool_event_is_sent(monkeypatch) -> None:
    from app.modules.runs import streaming

    run_id = str(uuid4())
    thread_id = uuid4()
    timeline = {"version": 1, "items": [message("user", "user", "search: timeline")]}
    agent_checkpoint = checkpoint(
        checkpoint_id=uuid4(),
        thread_id=thread_id,
        parent_id=uuid4(),
        items=timeline["items"],
    )

    class Session:
        def __init__(self) -> None:
            self.commits = 0

        async def commit(self) -> None:
            self.commits += 1

    class Repository:
        def __init__(self, _session) -> None:
            pass

        async def update_status(self, *_args, **_kwargs) -> None:
            return None

    class Interrupts:
        def __init__(self, _session) -> None:
            pass

        async def create(self, *_args, **_kwargs) -> None:
            return None

    monkeypatch.setattr(streaming, "RunRepository", Repository)
    monkeypatch.setattr(streaming, "InterruptRepository", Interrupts)
    session = Session()
    runs._cancel_events[run_id] = asyncio.Event()
    stream = runs.run_events(
        run_id,
        RunRequest(thread_id=str(thread_id), content="search: timeline"),
        session,
        RunBranchContext(agent_checkpoint.id, timeline, checkpoint=agent_checkpoint),
    )

    async for encoded in stream:
        if '"event":"tool.call"' not in encoded:
            continue
        tool_items = [
            item for item in agent_checkpoint.state["timeline"]["items"] if item["kind"] == "tool"
        ]
        assert len(tool_items) == 1
        assert tool_items[0]["status"] == "awaiting_approval"
        assert session.commits == 2
        break
    else:
        raise AssertionError("未产生工具调用事件")

    await stream.aclose()
    runs._cancel_events.pop(run_id, None)


@pytest.mark.asyncio
async def test_disconnected_stream_persists_partial_timeline_as_retryable() -> None:
    run_id = uuid4()
    thread_id = uuid4()
    partial = message("assistant-partial", "assistant", "部分回复")
    partial["run_id"] = str(run_id)
    partial["status"] = "streaming"
    agent_checkpoint = checkpoint(
        checkpoint_id=uuid4(),
        thread_id=thread_id,
        parent_id=uuid4(),
        items=[partial],
    )
    run = Run(id=run_id, thread_id=thread_id, status=RunStatus.RUNNING)
    session = FakePersistenceSession(run)
    runs._cancel_events[str(run_id)] = asyncio.Event()

    await runs._finalize_incomplete_stream(
        str(run_id),
        RunRequest(thread_id=str(thread_id), content="问题"),
        session,
        RunBranchContext(agent_checkpoint.id, empty_timeline(), checkpoint=agent_checkpoint),
        interrupted_is_terminal=True,
    )

    items = agent_checkpoint.state["timeline"]["items"]
    assert items[0]["status"] == "cancelled"
    assert items[-1]["id"] == f"{run_id}:disconnected"
    assert run.status is RunStatus.CANCELLED
    assert run.error_message == "连接已中断，已保留部分内容，请重试"
    assert session.commits == 1


@pytest.mark.asyncio
async def test_unexpected_resume_failure_persists_failed_timeline(monkeypatch) -> None:
    run_id = uuid4()
    thread_id = uuid4()
    tool = {
        "id": "call-1",
        "kind": "tool",
        "run_id": str(run_id),
        "sequence": 3,
        "tool": "search",
        "arguments": {},
        "request_id": "request-1",
        "result": None,
        "status": "awaiting_approval",
    }
    agent_checkpoint = checkpoint(
        checkpoint_id=uuid4(),
        thread_id=thread_id,
        parent_id=uuid4(),
        items=[tool],
    )
    run = Run(id=run_id, thread_id=thread_id, status=RunStatus.RESUMING)
    session = FakePersistenceSession(run)

    async def broken(*_args, **_kwargs):
        raise RuntimeError("stream broke")
        yield "never"

    monkeypatch.setattr(runs, "resumed_run_events", broken)
    events = [
        event
        async for event in runs.safe_resumed_run_events(
            str(run_id),
            RunRequest(thread_id=str(thread_id), content="问题"),
            "request-1",
            "approve",
            session,
            RunBranchContext(
                agent_checkpoint.id,
                empty_timeline(),
                checkpoint=agent_checkpoint,
            ),
        )
    ]

    assert any('"event":"run.failed"' in event for event in events)
    assert agent_checkpoint.state["timeline"]["items"][0]["status"] == "failed"
    assert agent_checkpoint.state["timeline"]["items"][-1]["kind"] == "error"
    assert run.status is RunStatus.FAILED
    assert session.commits == 1


@pytest.mark.asyncio
async def test_disconnected_resume_does_not_leave_run_interrupted() -> None:
    run_id = uuid4()
    thread_id = uuid4()
    tool = {
        "id": "call-1",
        "kind": "tool",
        "run_id": str(run_id),
        "sequence": 3,
        "tool": "search",
        "arguments": {},
        "request_id": "request-1",
        "result": None,
        "status": "awaiting_approval",
    }
    agent_checkpoint = checkpoint(
        checkpoint_id=uuid4(),
        thread_id=thread_id,
        parent_id=uuid4(),
        items=[tool],
    )
    run = Run(id=run_id, thread_id=thread_id, status=RunStatus.INTERRUPTED)
    session = FakePersistenceSession(run)
    runs._cancel_events[str(run_id)] = asyncio.Event()

    await runs._finalize_incomplete_stream(
        str(run_id),
        RunRequest(thread_id=str(thread_id), content="问题"),
        session,
        RunBranchContext(agent_checkpoint.id, empty_timeline(), checkpoint=agent_checkpoint),
        interrupted_is_terminal=False,
    )

    assert run.status is RunStatus.CANCELLED
    assert agent_checkpoint.state["timeline"]["items"][0]["status"] == "cancelled"
    assert agent_checkpoint.state["timeline"]["items"][-1]["kind"] == "error"


def test_timeline_projects_selected_sibling_and_latest_descendant() -> None:
    thread_id = uuid4()
    user_a_id, user_b_id = uuid4(), uuid4()
    agent_a_id, agent_b_id, follow_up_id = uuid4(), uuid4(), uuid4()
    user_a, user_b = message("user-a", "user", "问题 A"), message("user-b", "user", "问题 B")
    assistant_a = message("assistant-a", "assistant", "回答 A")
    assistant_b = message("assistant-b", "assistant", "回答 B")
    checkpoints = [
        checkpoint(checkpoint_id=user_a_id, thread_id=thread_id, parent_id=None, items=[user_a]),
        checkpoint(checkpoint_id=user_b_id, thread_id=thread_id, parent_id=None, items=[user_b]),
        checkpoint(
            checkpoint_id=agent_a_id,
            thread_id=thread_id,
            parent_id=user_a_id,
            items=[user_a, assistant_a],
        ),
        checkpoint(
            checkpoint_id=agent_b_id,
            thread_id=thread_id,
            parent_id=user_b_id,
            items=[user_b, assistant_b],
        ),
        checkpoint(
            checkpoint_id=follow_up_id,
            thread_id=thread_id,
            parent_id=agent_a_id,
            items=[user_a, assistant_a],
        ),
    ]

    branch_a = service.resolve_timeline_branch(checkpoints[-1], checkpoints)
    branch_b = service.resolve_timeline_branch(checkpoints[3], checkpoints)
    projected_a = branch_a["items"][0]
    projected_b = branch_b["items"][0]

    assert projected_a["branch_index"] == 0
    assert projected_b["branch_index"] == 1
    assert [item["checkpoint_id"] for item in projected_a["branch_options"]] == [
        str(follow_up_id),
        str(agent_b_id),
    ]
    assert projected_b["content"] == "问题 B"


def test_timeline_projects_branch_options_on_terminal_error_without_assistant_message() -> None:
    thread_id = uuid4()
    user_id, failed_agent_id, successful_agent_id = uuid4(), uuid4(), uuid4()
    user = message("user", "user", "问题")
    error = {
        "id": "error-1",
        "kind": "error",
        "run_id": "run-failed",
        "sequence": 2,
        "status": "failed",
        "message": "运行失败",
    }
    assistant = message("assistant", "assistant", "回答")
    checkpoints = [
        checkpoint(checkpoint_id=user_id, thread_id=thread_id, parent_id=None, items=[user]),
        checkpoint(
            checkpoint_id=failed_agent_id,
            thread_id=thread_id,
            parent_id=user_id,
            items=[user, error],
        ),
        checkpoint(
            checkpoint_id=successful_agent_id,
            thread_id=thread_id,
            parent_id=user_id,
            items=[user, assistant],
        ),
    ]

    projected = service.resolve_timeline_branch(checkpoints[1], checkpoints)
    terminal_error = projected["items"][-1]

    assert terminal_error["kind"] == "error"
    assert terminal_error["branch_index"] == 0
    assert [option["checkpoint_id"] for option in terminal_error["branch_options"]] == [
        str(failed_agent_id),
        str(successful_agent_id),
    ]
