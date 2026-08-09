import asyncio
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
import pytest

from app.api import runs
from app.api.runs import RunBranchContext, RunRequest, _load_branch_base
from app.db.models import Checkpoint
from app.modules.checkpoints import service


def checkpoint(*, checkpoint_id, thread_id, parent_id, messages):
    return Checkpoint(
        id=checkpoint_id,
        thread_id=thread_id,
        parent_id=parent_id,
        state={"messages": messages},
    )


@pytest.mark.asyncio
async def test_explicit_null_checkpoint_means_root_branch() -> None:
    thread = SimpleNamespace(current_checkpoint_id=uuid4())

    checkpoint_id, messages = await _load_branch_base(
        object(),
        thread,
        None,
        use_current_if_none=False,
    )

    assert checkpoint_id is None
    assert messages == ()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["send", "edit"])
async def test_send_and_edit_create_user_checkpoint_from_selected_parent(monkeypatch, mode) -> None:
    base_id = uuid4()
    user_checkpoint_id = uuid4()
    calls = []

    async def fake_append(_session, _thread, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            checkpoint=SimpleNamespace(id=user_checkpoint_id),
            messages=({"id": "user", "role": "user", "content": {"content": "新问题"}},),
        )

    monkeypatch.setattr(service, "append_message_checkpoint", fake_append)
    context = await service.create_run_branch(
        object(),
        SimpleNamespace(),
        run_id=uuid4(),
        mode=mode,
        content="新问题",
        base_checkpoint_id=base_id,
        base_messages=(),
    )

    assert calls[0]["parent_id"] == base_id
    assert context.checkpoint_id == user_checkpoint_id
    assert context.created_checkpoint.id == user_checkpoint_id


@pytest.mark.asyncio
async def test_regenerate_reuses_user_checkpoint_without_adding_user_message(monkeypatch) -> None:
    user_checkpoint_id = uuid4()

    async def unexpected_append(*_args, **_kwargs):
        raise AssertionError("重新生成不应新增用户消息")

    monkeypatch.setattr(service, "append_message_checkpoint", unexpected_append)
    messages = ({"id": "user", "role": "user", "content": {"content": "原问题"}},)
    context = await service.create_run_branch(
        object(),
        SimpleNamespace(),
        run_id=uuid4(),
        mode="regenerate",
        content="原问题",
        base_checkpoint_id=user_checkpoint_id,
        base_messages=messages,
    )

    assert context.checkpoint_id == user_checkpoint_id
    assert context.messages == messages
    assert context.created_checkpoint is None


@pytest.mark.asyncio
async def test_prepare_regenerate_rejects_non_user_checkpoint(monkeypatch) -> None:
    async def fake_load_branch_base(*_args, **_kwargs):
        return uuid4(), (
            {
                "id": "assistant",
                "role": "assistant",
                "content": {"content": "旧回复"},
            },
        )

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
async def test_prepare_regenerate_rejects_missing_checkpoint_for_persisted_thread(monkeypatch) -> None:
    async def fake_load_branch_base(*_args, **_kwargs):
        return None, ()

    monkeypatch.setattr(runs, "_load_branch_base", fake_load_branch_base)

    with pytest.raises(HTTPException) as raised:
        await runs._prepare_persisted_run(
            object(),
            uuid4(),
            RunRequest(
                thread_id=str(uuid4()),
                content="重新生成",
                checkpoint_id=None,
                mode="regenerate",
            ),
            SimpleNamespace(id=uuid4()),
        )

    assert raised.value.status_code == 400


@pytest.mark.asyncio
async def test_run_passes_complete_checkpoint_history_to_graph(monkeypatch) -> None:
    run_id = str(uuid4())
    captured_messages = []
    snapshots = (
        {"id": "u1", "role": "user", "content": {"content": "第一问"}},
        {"id": "a1", "role": "assistant", "content": {"content": "第一答"}},
        {"id": "u2", "role": "user", "content": {"content": "第二问"}},
    )

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
            RunRequest(thread_id="history-thread", content="第二问"),
            branch_context=RunBranchContext(uuid4(), snapshots),
        )
    ]

    assert captured_messages == [
        {"role": "user", "content": "第一问"},
        {"role": "assistant", "content": "第一答"},
        {"role": "user", "content": "第二问"},
    ]


def test_history_projects_selected_sibling_and_latest_descendant() -> None:
    thread_id = uuid4()
    user_a_id, user_b_id = uuid4(), uuid4()
    assistant_a_id, assistant_b_id = uuid4(), uuid4()
    follow_up_id = uuid4()
    user_a = {
        "id": str(uuid4()),
        "role": "user",
        "content": {"content": "问题 A"},
        "checkpoint_id": str(user_a_id),
    }
    user_b = {
        "id": str(uuid4()),
        "role": "user",
        "content": {"content": "问题 B"},
        "checkpoint_id": str(user_b_id),
    }
    assistant_a = {
        "id": str(uuid4()),
        "role": "assistant",
        "content": {"content": "回答 A"},
        "checkpoint_id": str(assistant_a_id),
    }
    assistant_b = {
        "id": str(uuid4()),
        "role": "assistant",
        "content": {"content": "回答 B"},
        "checkpoint_id": str(assistant_b_id),
    }
    checkpoints = [
        checkpoint(checkpoint_id=user_a_id, thread_id=thread_id, parent_id=None, messages=[user_a]),
        checkpoint(checkpoint_id=user_b_id, thread_id=thread_id, parent_id=None, messages=[user_b]),
        checkpoint(
            checkpoint_id=assistant_a_id,
            thread_id=thread_id,
            parent_id=user_a_id,
            messages=[user_a, assistant_a],
        ),
        checkpoint(
            checkpoint_id=assistant_b_id,
            thread_id=thread_id,
            parent_id=user_b_id,
            messages=[user_b, assistant_b],
        ),
        checkpoint(
            checkpoint_id=follow_up_id,
            thread_id=thread_id,
            parent_id=assistant_a_id,
            messages=[user_a, assistant_a],
        ),
    ]

    branch_a = service.project_history_messages(checkpoints[-1], checkpoints, [])
    branch_b = service.project_history_messages(checkpoints[3], checkpoints, [])

    assert branch_a[0]["branch_index"] == 0
    assert branch_b[0]["branch_index"] == 1
    assert [item["checkpoint_id"] for item in branch_a[0]["branch_options"]] == [
        str(follow_up_id),
        str(assistant_b_id),
    ]
    assert branch_b[0]["content"] == "问题 B"
