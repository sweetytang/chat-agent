from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.db.models import RefreshToken
from app.modules.auth.refresh_tokens import (
    RefreshTokenError,
    create_refresh_token,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
)


class Result:
    def __init__(self, item=None, rowcount=0):
        self.item = item
        self.rowcount = rowcount

    def scalar_one_or_none(self):
        return self.item


class FakeSession:
    def __init__(self):
        self.items: list[RefreshToken] = []
        self.commit_calls = 0

    def add(self, item):
        self.items.append(item)

    async def flush(self):
        return None

    async def commit(self):
        self.commit_calls += 1

    async def execute(self, query):
        params = query.compile().params
        if query.is_update:
            changed = 0
            for item in self.items:
                if item.user_id == params["user_id_1"] and item.revoked_at is None:
                    item.revoked_at = params["revoked_at"]
                    changed += 1
            return Result(rowcount=changed)
        token_hash = params.get("token_hash_1")
        return Result(next((item for item in self.items if item.token_hash == token_hash), None))


@pytest.mark.asyncio
async def test_refresh_token_rotation_revokes_old_token():
    session = FakeSession()
    user_id = uuid4()
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    raw, old = await create_refresh_token(session, user_id, now=now)

    new_raw, replacement = await rotate_refresh_token(session, raw, now=now + timedelta(minutes=1))

    assert raw != new_raw
    assert old.revoked_at == now + timedelta(minutes=1)
    assert old.replaced_by_token_id == replacement.id
    with pytest.raises(RefreshTokenError):
        await rotate_refresh_token(session, raw, now=now + timedelta(minutes=2))


@pytest.mark.asyncio
async def test_revoke_token_is_idempotent():
    session = FakeSession()
    raw, token = await create_refresh_token(session, uuid4())

    assert await revoke_refresh_token(session, raw) is True
    assert await revoke_refresh_token(session, raw) is False
    assert token.revoked_at is not None


@pytest.mark.asyncio
async def test_revoke_all_tokens_only_changes_active_tokens():
    session = FakeSession()
    user_id = uuid4()
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _, first = await create_refresh_token(session, user_id, now=now)
    _, second = await create_refresh_token(session, user_id, now=now)
    first.revoked_at = now

    assert await revoke_all_refresh_tokens(session, user_id, now=now + timedelta(days=1)) == 1
    assert second.revoked_at == now + timedelta(days=1)


@pytest.mark.asyncio
async def test_refresh_token_service_does_not_commit_partial_work():
    session = FakeSession()

    await create_refresh_token(session, uuid4())

    assert session.commit_calls == 0
