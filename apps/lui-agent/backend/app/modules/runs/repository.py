from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Message, MessageRole, Run, RunStatus, Thread


class RunRepository:
    """运行与消息的持久化边界；事务提交由调用方控制。"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        thread_id: UUID,
        *,
        run_id: UUID | None = None,
        queue_position: int | None = None,
    ) -> Run:
        run = Run(
            id=run_id or uuid4(),
            thread_id=thread_id,
            status=RunStatus.QUEUED,
            queue_position=queue_position,
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def get_owned(self, run_id: UUID, user_id: UUID) -> Run | None:
        run = await self.session.get(Run, run_id)
        if run is None:
            return None
        thread = await self.session.get(Thread, run.thread_id)
        return run if thread is not None and thread.user_id == user_id else None

    async def update_status(
        self,
        run_id: UUID,
        status: RunStatus,
        *,
        error_message: str | None = None,
    ) -> Run:
        run = await self.session.get(Run, run_id)
        if run is None:
            raise ValueError("运行不存在")
        run.status = status
        run.error_message = error_message
        if status is RunStatus.CANCELLED:
            run.cancelled_at = datetime.now(timezone.utc)
        await self.session.flush()
        return run

    async def append_message(
        self,
        thread_id: UUID,
        role: MessageRole,
        content: dict,
        *,
        run_id: UUID | None = None,
        checkpoint_id: UUID | None = None,
    ) -> Message:
        message = Message(
            id=uuid4(),
            thread_id=thread_id,
            run_id=run_id,
            checkpoint_id=checkpoint_id,
            role=role,
            content=content,
        )
        self.session.add(message)
        await self.session.flush()
        return message
