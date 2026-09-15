from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models import Thread, Checkpoint


class CheckpointRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, thread_id: UUID, checkpoint_id: UUID) -> Checkpoint | None:
        result = await self.session.execute(
            select(Checkpoint).where(
                Checkpoint.thread_id == thread_id,
                Checkpoint.id == checkpoint_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_thread(self, thread_id: UUID) -> list[Checkpoint]:
        result = await self.session.execute(
            select(Checkpoint)
            .where(Checkpoint.thread_id == thread_id)
            .order_by(Checkpoint.created_at.asc())
        )
        return list(result.scalars())

    async def append(
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

    async def switch(self, thread: Thread, checkpoint: Checkpoint) -> Thread:
        if checkpoint.thread_id != thread.id:
            raise ValueError("checkpoint 不属于当前线程")
        thread.current_checkpoint_id = checkpoint.id
        await self.session.flush()
        return thread
