from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint, Thread


class ThreadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session


    async def list_owned(self, user_id: UUID) -> list[Thread]:
        result = await self.session.execute(
            select(Thread)
            .where(Thread.user_id == user_id)
            .order_by(Thread.is_pinned.desc(), Thread.updated_at.desc())
        )
        return list(result.scalars())

    
    async def create(self, user_id: UUID, title: str | None = None) -> Thread:
        thread = Thread(id=uuid4(), user_id=user_id, title=title)
        self.session.add(thread)
        await self.session.flush()
        return thread


    async def delete(self, thread: Thread) -> None:
        await self.session.execute(delete(Thread).where(Thread.id == thread.id))


    async def get_owned(self, thread_id: UUID, user_id: UUID) -> Thread | None:
        result = await self.session.execute(
            select(Thread).where(Thread.id == thread_id, Thread.user_id == user_id)
        )
        return result.scalar_one_or_none()


    async def update(
        self,
        thread: Thread,
        *,
        title: str | None = None,
        is_pinned: bool | None = None,
    ) -> Thread:
        if title is not None:
            thread.title = title
        if is_pinned is not None:
            thread.is_pinned = is_pinned
        await self.session.flush()
        return thread
