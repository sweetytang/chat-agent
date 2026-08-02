from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint, Message, Thread


class ThreadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, user_id: UUID, title: str | None = None) -> Thread:
        thread = Thread(id=uuid4(), user_id=user_id, title=title)
        self.session.add(thread)
        await self.session.flush()
        return thread

    async def get_owned(self, thread_id: UUID, user_id: UUID) -> Thread | None:
        result = await self.session.execute(
            select(Thread).where(Thread.id == thread_id, Thread.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def list_owned(self, user_id: UUID) -> list[Thread]:
        result = await self.session.execute(
            select(Thread).where(Thread.user_id == user_id).order_by(Thread.updated_at.desc())
        )
        return list(result.scalars())

    async def list_messages(self, thread_id: UUID) -> list[Message]:
        result = await self.session.execute(
            select(Message).where(Message.thread_id == thread_id).order_by(Message.created_at.asc())
        )
        return list(result.scalars())

    async def append_checkpoint(
        self,
        thread: Thread,
        state: dict,
        parent_id: UUID | None,
        branch_name: str | None = None,
    ) -> Checkpoint:
        checkpoint = Checkpoint(
            id=uuid4(),
            thread_id=thread.id,
            parent_id=parent_id,
            state=state,
            branch_name=branch_name,
        )
        self.session.add(checkpoint)
        thread.current_checkpoint_id = checkpoint.id
        await self.session.flush()
        return checkpoint

    async def list_checkpoints(self, thread_id: UUID) -> list[Checkpoint]:
        result = await self.session.execute(
            select(Checkpoint)
            .where(Checkpoint.thread_id == thread_id)
            .order_by(Checkpoint.created_at.asc())
        )
        return list(result.scalars())

    async def get_checkpoint(self, thread_id: UUID, checkpoint_id: UUID) -> Checkpoint | None:
        result = await self.session.execute(
            select(Checkpoint).where(
                Checkpoint.thread_id == thread_id,
                Checkpoint.id == checkpoint_id,
            )
        )
        return result.scalar_one_or_none()

    async def switch_checkpoint(self, thread: Thread, checkpoint: Checkpoint) -> Thread:
        if checkpoint.thread_id != thread.id:
            raise ValueError("checkpoint 不属于当前线程")
        thread.current_checkpoint_id = checkpoint.id
        await self.session.flush()
        return thread
