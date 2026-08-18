from uuid import uuid4

import pytest

from app.db.models import RunStatus
from app.modules.runs.repository import RunRepository


class FakeSession:
    def __init__(self) -> None:
        self.items = []
        self.runs = {}

    def add(self, item) -> None:
        self.items.append(item)
        if hasattr(item, "thread_id") and item.__class__.__name__ == "Run":
            self.runs[item.id] = item

    async def flush(self) -> None:
        return None

    async def get(self, model, item_id):
        return self.runs.get(item_id)


@pytest.mark.asyncio
async def test_run_repository_persists_lifecycle() -> None:
    session = FakeSession()
    repository = RunRepository(session)
    thread_id = uuid4()

    run = await repository.create(thread_id)
    await repository.update_status(run.id, RunStatus.RUNNING)
    assert run.status is RunStatus.RUNNING


@pytest.mark.asyncio
async def test_run_repository_marks_cancelled_at() -> None:
    session = FakeSession()
    run = await RunRepository(session).create(uuid4())

    await RunRepository(session).update_status(run.id, RunStatus.CANCELLED)

    assert run.cancelled_at is not None
