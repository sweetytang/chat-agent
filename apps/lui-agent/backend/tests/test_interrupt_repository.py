from uuid import uuid4

import pytest

from app.db.models import InterruptStatus
from app.modules.interrupts.repository import InterruptRepository


class FakeSession:
    def __init__(self) -> None:
        self.items = []

    def add(self, item) -> None:
        self.items.append(item)

    async def flush(self) -> None:
        return None

    async def execute(self, _query):
        class Result:
            def scalar_one_or_none(self):
                return None

        return Result()


@pytest.mark.asyncio
async def test_interrupt_repository_creates_pending_interrupt() -> None:
    repository = InterruptRepository(FakeSession())
    interrupt = await repository.create(uuid4(), "request-1", "tool", {"name": "search"})

    assert interrupt.status is InterruptStatus.PENDING
    assert interrupt.request_id == "request-1"
