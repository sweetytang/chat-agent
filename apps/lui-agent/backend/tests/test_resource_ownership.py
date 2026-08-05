import asyncio
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.api.runs import PendingReview, RunRequest, _cancel_events, _pending_reviews
from app.core.security import create_access_token
from app.db.models import Interrupt, InterruptStatus, Run, RunStatus, Thread
from app.db.session import get_db_session, get_optional_db_session
from app.main import app


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, *, objects=(), execute_values=()) -> None:
        self.objects = {(type(item), item.id): item for item in objects}
        self.execute_values = list(execute_values)
        self.added = []

    async def get(self, model, item_id):
        return self.objects.get((model, item_id))

    async def execute(self, _query):
        value = self.execute_values.pop(0) if self.execute_values else None
        return ScalarResult(value)

    def add(self, item) -> None:
        self.added.append(item)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


def request_with_session(dependency, session, method: str, path: str, **kwargs):
    async def override_session():
        yield session

    app.dependency_overrides[dependency] = override_session
    try:
        return TestClient(app).request(method, path, **kwargs)
    finally:
        app.dependency_overrides.pop(dependency, None)


def bearer(user_id) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user_id))}"}


def owned_models():
    owner_id = uuid4()
    thread = Thread(id=uuid4(), user_id=owner_id, title=None, current_checkpoint_id=None)
    run = Run(id=uuid4(), thread_id=thread.id, status=RunStatus.INTERRUPTED)
    return owner_id, thread, run


@pytest.mark.parametrize(
    ("headers", "expected_status"),
    [({}, 401), ({"Authorization": "Bearer invalid"}, 401)],
)
def test_persisted_stream_requires_valid_token(headers, expected_status) -> None:
    _, thread, _ = owned_models()
    response = request_with_session(
        get_optional_db_session,
        FakeSession(objects=[thread]),
        "POST",
        "/api/runs/stream",
        headers=headers,
        json={"thread_id": str(thread.id), "content": "你好"},
    )

    assert response.status_code == expected_status


def test_nonexistent_thread_keeps_anonymous_stream_protocol() -> None:
    response = request_with_session(
        get_optional_db_session,
        FakeSession(),
        "POST",
        "/api/runs/stream",
        json={"thread_id": str(uuid4()), "content": "你好"},
    )

    assert response.status_code == 200
    assert "event: run.completed" in response.text


def test_persisted_stream_hides_other_users_thread() -> None:
    _, thread, _ = owned_models()
    response = request_with_session(
        get_optional_db_session,
        FakeSession(objects=[thread]),
        "POST",
        "/api/runs/stream",
        headers=bearer(uuid4()),
        json={"thread_id": str(thread.id), "content": "越权"},
    )

    assert response.status_code == 404


def test_persisted_cancel_requires_authentication() -> None:
    _, thread, run = owned_models()
    _cancel_events[str(run.id)] = asyncio.Event()
    try:
        response = request_with_session(
            get_optional_db_session,
            FakeSession(objects=[thread, run]),
            "POST",
            f"/api/runs/{run.id}/cancel",
        )
        assert response.status_code == 401
    finally:
        _cancel_events.pop(str(run.id), None)


def test_persisted_resume_hides_other_users_run() -> None:
    _, thread, run = owned_models()
    request_id = f"request-{uuid4()}"
    _pending_reviews[request_id] = PendingReview(
        str(run.id),
        RunRequest(thread_id=str(thread.id), content="search: test"),
        None,
        persisted=True,
    )
    try:
        response = request_with_session(
            get_optional_db_session,
            FakeSession(objects=[thread, run]),
            "POST",
            f"/api/runs/{run.id}/resume",
            headers=bearer(uuid4()),
            json={"request_id": request_id, "decision": "approve"},
        )
        assert response.status_code == 404
    finally:
        _pending_reviews.pop(request_id, None)


def test_persisted_resume_requires_existing_run() -> None:
    owner_id, thread, run = owned_models()
    request_id = f"request-{uuid4()}"
    _pending_reviews[request_id] = PendingReview(
        str(run.id),
        RunRequest(thread_id=str(thread.id), content="search: test"),
        None,
        persisted=True,
    )
    try:
        response = request_with_session(
            get_optional_db_session,
            FakeSession(objects=[thread]),
            "POST",
            f"/api/runs/{run.id}/resume",
            headers=bearer(owner_id),
            json={"request_id": request_id, "decision": "approve"},
        )
        assert response.status_code == 404
        assert request_id in _pending_reviews
    finally:
        _pending_reviews.pop(request_id, None)


def test_interrupt_create_rejects_other_users_run() -> None:
    _, thread, run = owned_models()
    session = FakeSession(objects=[thread, run])
    response = request_with_session(
        get_db_session,
        session,
        "POST",
        "/api/interrupts",
        headers=bearer(uuid4()),
        json={"run_id": str(run.id), "request_id": "request-1", "kind": "tool"},
    )

    assert response.status_code == 404
    assert session.added == []


def test_interrupt_create_rejects_checkpoint_outside_run_thread() -> None:
    owner_id, _thread, run = owned_models()
    session = FakeSession(objects=[_thread, run], execute_values=[None])
    response = request_with_session(
        get_db_session,
        session,
        "POST",
        "/api/interrupts",
        headers=bearer(owner_id),
        json={
            "run_id": str(run.id),
            "request_id": "request-1",
            "kind": "tool",
            "checkpoint_id": str(uuid4()),
        },
    )

    assert response.status_code == 404
    assert session.added == []


@pytest.mark.parametrize(
    ("path_suffix", "json"),
    [("resolve", {"decision": "approve"}), ("resume", None)],
)
def test_interrupt_mutation_rejects_other_users_run(path_suffix, json) -> None:
    _, thread, run = owned_models()
    interrupt = Interrupt(
        id=uuid4(),
        run_id=run.id,
        checkpoint_id=None,
        request_id="request-1",
        kind="tool",
        payload={},
        status=InterruptStatus.PENDING,
    )
    kwargs = {"json": json} if json is not None else {}
    response = request_with_session(
        get_db_session,
        FakeSession(objects=[thread, run], execute_values=[interrupt]),
        "POST",
        f"/api/interrupts/{interrupt.request_id}/{path_suffix}",
        headers=bearer(uuid4()),
        **kwargs,
    )

    assert response.status_code == 404
    assert interrupt.status is InterruptStatus.PENDING


def test_pending_interrupt_route_replays_web_search_payload() -> None:
    owner_id, thread, run = owned_models()
    interrupt = Interrupt(
        id=uuid4(),
        run_id=run.id,
        checkpoint_id=None,
        request_id="request-1",
        kind="tool",
        payload={"tool": "web_search", "query": "LangGraph"},
        status=InterruptStatus.PENDING,
    )
    response = request_with_session(
        get_db_session,
        FakeSession(execute_values=[thread, interrupt]),
        "GET",
        f"/api/threads/{thread.id}/interrupts/pending",
        headers=bearer(owner_id),
    )

    assert response.status_code == 200
    assert response.json() == {
        "request_id": "request-1",
        "run_id": str(run.id),
        "kind": "tool",
        "tool": "web_search",
        "payload": {"tool": "web_search", "query": "LangGraph"},
    }
