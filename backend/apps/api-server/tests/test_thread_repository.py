from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.db.models import MessageRole
from app.modules.threads.repository import ThreadRepository


class FakeScalarResult:
    def __init__(self, values) -> None:
        self.values = values

    def scalars(self):
        return self.values


class FakeSession:
    def __init__(self, values) -> None:
        self.values = values
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return FakeScalarResult(self.values)

    async def flush(self):
        return None


@pytest.mark.asyncio
async def test_first_qa_pairs_uses_one_ordered_query_and_requires_adjacent_roles() -> None:
    complete_id, interrupted_id = uuid4(), uuid4()
    complete_user = SimpleNamespace(thread_id=complete_id, role=MessageRole.USER)
    complete_assistant = SimpleNamespace(thread_id=complete_id, role=MessageRole.ASSISTANT)
    interrupted_user = SimpleNamespace(thread_id=interrupted_id, role=MessageRole.USER)
    interrupted_second_user = SimpleNamespace(thread_id=interrupted_id, role=MessageRole.USER)
    session = FakeSession(
        [complete_user, complete_assistant, interrupted_user, interrupted_second_user]
    )

    result = await ThreadRepository(session).first_qa_pairs([complete_id, interrupted_id])

    assert result == {complete_id: (complete_user, complete_assistant)}
    sql = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "messages.thread_id IN" in sql
    assert "messages.role IN ('USER', 'ASSISTANT')" in sql
    assert "messages.thread_id ASC, messages.created_at ASC, messages.id ASC" in sql


@pytest.mark.asyncio
async def test_list_owned_orders_pinned_threads_before_recent_threads() -> None:
    session = FakeSession([])

    await ThreadRepository(session).list_owned(uuid4())

    sql = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "threads.is_pinned DESC, threads.updated_at DESC" in sql


@pytest.mark.asyncio
async def test_update_and_delete_thread_use_repository_session() -> None:
    thread = SimpleNamespace(id=uuid4(), title="旧标题", is_pinned=False)
    session = FakeSession([])
    repository = ThreadRepository(session)

    updated = await repository.update(thread, title="新标题", is_pinned=True)
    await repository.delete(thread)

    assert updated.title == "新标题"
    assert updated.is_pinned is True
    sql = str(session.statement.compile(compile_kwargs={"literal_binds": True}))
    assert f"DELETE FROM threads WHERE threads.id = '{thread.id.hex}'" in sql
