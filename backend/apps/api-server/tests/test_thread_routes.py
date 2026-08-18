from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api import threads as thread_api
from app.main import app
from tests.route_helpers import route_paths


def test_thread_routes_are_exposed() -> None:
    routes = route_paths(app)

    assert {"/api/threads", "/api/threads/{thread_id}"} <= routes


@pytest.mark.asyncio
async def test_update_thread_checks_ownership_and_commits(monkeypatch) -> None:
    owner_id, thread_id = uuid4(), uuid4()
    thread = SimpleNamespace(
        id=thread_id,
        title="旧标题",
        is_pinned=False,
        current_checkpoint_id=None,
    )

    class FakeRepository:
        def __init__(self, _session) -> None:
            pass

        async def get_owned(self, requested_thread_id, requested_user_id):
            assert (requested_thread_id, requested_user_id) == (thread_id, owner_id)
            return thread

        async def update(self, item, *, title, is_pinned):
            item.title = title
            item.is_pinned = is_pinned

    class FakeSession:
        def __init__(self) -> None:
            self.commits = 0

        async def commit(self) -> None:
            self.commits += 1

    monkeypatch.setattr(thread_api, "ThreadRepository", FakeRepository)
    session = FakeSession()

    response = await thread_api.update_thread(
        thread_id,
        thread_api.UpdateThreadRequest(title="新标题", is_pinned=True),
        owner_id,
        session,
    )

    assert response.title == "新标题"
    assert response.is_pinned is True
    assert session.commits == 1


@pytest.mark.asyncio
async def test_update_thread_preserves_omitted_fields(monkeypatch) -> None:
    owner_id, thread_id = uuid4(), uuid4()
    thread = SimpleNamespace(
        id=thread_id,
        title="自定义标题",
        is_pinned=False,
        current_checkpoint_id=None,
    )

    class FakeRepository:
        def __init__(self, _session) -> None:
            pass

        async def get_owned(self, _thread_id, _user_id):
            return thread

        async def update(self, item, *, title, is_pinned):
            if title is not None:
                item.title = title
            if is_pinned is not None:
                item.is_pinned = is_pinned

    class FakeSession:
        async def commit(self) -> None:
            pass

    monkeypatch.setattr(thread_api, "ThreadRepository", FakeRepository)

    response = await thread_api.update_thread(
        thread_id,
        thread_api.UpdateThreadRequest(is_pinned=True),
        owner_id,
        FakeSession(),
    )

    assert response.title == "自定义标题"
    assert response.is_pinned is True


@pytest.mark.asyncio
async def test_delete_owned_thread_commits(monkeypatch) -> None:
    owner_id, thread_id = uuid4(), uuid4()
    thread = SimpleNamespace(id=thread_id)
    deleted: list[object] = []

    class FakeRepository:
        def __init__(self, _session) -> None:
            pass

        async def get_owned(self, requested_thread_id, requested_user_id):
            assert (requested_thread_id, requested_user_id) == (thread_id, owner_id)
            return thread

        async def delete(self, item):
            deleted.append(item)

    class FakeSession:
        def __init__(self) -> None:
            self.commits = 0

        async def commit(self) -> None:
            self.commits += 1

    monkeypatch.setattr(thread_api, "ThreadRepository", FakeRepository)
    session = FakeSession()

    response = await thread_api.delete_thread(thread_id, owner_id, session)

    assert response is None
    assert deleted == [thread]
    assert session.commits == 1


@pytest.mark.asyncio
async def test_delete_thread_hides_unowned_resource(monkeypatch) -> None:
    class FakeRepository:
        def __init__(self, _session) -> None:
            pass

        async def get_owned(self, _thread_id, _user_id):
            return None

    monkeypatch.setattr(thread_api, "ThreadRepository", FakeRepository)

    with pytest.raises(thread_api.HTTPException) as error:
        await thread_api.delete_thread(uuid4(), uuid4(), object())

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_list_threads_does_not_read_deleted_message_history(monkeypatch) -> None:
    legacy = SimpleNamespace(
        id=uuid4(), title="新对话", is_pinned=False, current_checkpoint_id=None
    )
    custom = SimpleNamespace(
        id=uuid4(), title="自定义标题", is_pinned=False, current_checkpoint_id=None
    )

    class FakeRepository:
        def __init__(self, _session) -> None:
            pass

        async def list_owned(self, _user_id):
            return [legacy, custom]

    class FakeSession:
        async def commit(self) -> None:
            raise AssertionError("线程列表不应通过旧消息回填标题")

    monkeypatch.setattr(thread_api, "ThreadRepository", FakeRepository)
    session = FakeSession()

    response = await thread_api.list_threads(uuid4(), session)

    assert [item.title for item in response] == ["新对话", "自定义标题"]


@pytest.mark.asyncio
async def test_list_threads_does_not_commit_when_custom_title_is_unchanged(monkeypatch) -> None:
    custom = SimpleNamespace(
        id=uuid4(), title="自定义标题", is_pinned=False, current_checkpoint_id=None
    )

    class FakeRepository:
        def __init__(self, _session) -> None:
            pass

        async def list_owned(self, _user_id):
            return [custom]

    class FakeSession:
        async def commit(self) -> None:
            raise AssertionError("无标题变更时不应提交")

    monkeypatch.setattr(thread_api, "ThreadRepository", FakeRepository)

    response = await thread_api.list_threads(uuid4(), FakeSession())

    assert response[0].title == "自定义标题"
