from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import ThreadRepository
from app.db.models import Thread


async def get_owned_thread(
    thread_id: UUID,
    user_id: UUID,
    session: AsyncSession,
) -> Thread:
    """校验并获取当前用户拥有的 Thread。"""

    thread = await ThreadRepository(session).get_owned(thread_id, user_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="线程不存在")
    return thread


__all__ = ["get_owned_thread"]
