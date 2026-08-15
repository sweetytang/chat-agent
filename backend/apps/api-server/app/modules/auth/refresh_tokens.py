"""Refresh token 的生成、轮换和撤销。"""

from datetime import UTC, datetime, timedelta
import hashlib
import secrets
from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshToken


class RefreshTokenError(ValueError):
    """Refresh token 不可用。"""


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


async def create_refresh_token(
    session: AsyncSession,
    user_id: UUID,
    expires_in_days: int = 30,
    now: datetime | None = None,
) -> tuple[str, RefreshToken]:
    """创建 refresh token；只 flush，提交由调用方事务统一负责。"""
    raw_token = secrets.token_urlsafe(48)
    issued_at = now or _now()
    token = RefreshToken(
        id=uuid4(),
        user_id=user_id,
        token_hash=_hash_token(raw_token),
        expires_at=issued_at + timedelta(days=expires_in_days),
    )
    session.add(token)
    await session.flush()
    return raw_token, token


async def rotate_refresh_token(
    session: AsyncSession,
    raw_token: str,
    expires_in_days: int = 30,
    now: datetime | None = None,
) -> tuple[str, RefreshToken]:
    """原子地撤销旧 token 并签发新 token。调用方应在同一事务中提交。"""
    issued_at = now or _now()
    result = await session.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == _hash_token(raw_token))
        .with_for_update()
    )
    current = result.scalar_one_or_none()
    if current is None or current.revoked_at is not None or current.expires_at <= issued_at:
        raise RefreshTokenError("refresh token 无效或已过期")

    next_raw_token, replacement = await create_refresh_token(
        session, current.user_id, expires_in_days=expires_in_days, now=issued_at
    )
    current.revoked_at = issued_at
    current.replaced_by_token_id = replacement.id
    await session.flush()
    return next_raw_token, replacement


async def revoke_refresh_token(
    session: AsyncSession, raw_token: str, now: datetime | None = None
) -> bool:
    """撤销单个 token；token 不存在时返回 False，便于幂等登出。"""
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_token(raw_token))
    )
    token = result.scalar_one_or_none()
    if token is None or token.revoked_at is not None:
        return False
    token.revoked_at = now or _now()
    await session.flush()
    return True


async def revoke_all_refresh_tokens(
    session: AsyncSession, user_id: UUID, now: datetime | None = None
) -> int:
    """撤销用户全部未撤销 token，返回本次撤销数量。"""
    result = await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now or _now())
    )
    await session.flush()
    return cast(CursorResult[Any], result).rowcount
