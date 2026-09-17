from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Interrupt, InterruptStatus, Run, RunStatus
from app.modules.runs.repository import RunRepository


class InterruptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        run_id: UUID,
        request_id: str,
        kind: str,
        payload: dict,
        checkpoint_id: UUID | None = None,
    ) -> Interrupt:
        interrupt = Interrupt(
            run_id=run_id,
            checkpoint_id=checkpoint_id,
            request_id=request_id,
            kind=kind,
            payload=payload,
            status=InterruptStatus.PENDING,
        )
        self.session.add(interrupt)
        await self.session.flush()
        return interrupt

    async def get_by_request_id(self, request_id: str) -> Interrupt | None:
        result = await self.session.execute(
            select(Interrupt).where(Interrupt.request_id == request_id)
        )
        return result.scalar_one_or_none()

    async def get_owned_by_request_id(
        self,
        request_id: str,
        user_id: UUID,
    ) -> Interrupt | None:
        interrupt = await self.get_by_request_id(request_id)
        if interrupt is None:
            return None
        run = await RunRepository(self.session).get_owned(interrupt.run_id, user_id)
        return interrupt if run is not None else None

    async def get_pending_for_thread(self, thread_id: UUID) -> Interrupt | None:
        """获取指定线程中当前真正处于活跃中断（所属 Run 必须为 INTERRUPTED）的待审批记录。

        对于已结束（COMPLETED / FAILED / CANCELLED）的历史 Run 中的遗留中断，直接忽略。
        """
        result = await self.session.execute(
            select(Interrupt)
            .join(Run, Run.id == Interrupt.run_id)
            .where(
                Run.thread_id == thread_id,
                Run.status == RunStatus.INTERRUPTED,
                Interrupt.status == InterruptStatus.PENDING,
            )
            .order_by(Interrupt.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def set_status(
        self,
        interrupt: Interrupt,
        status: InterruptStatus,
    ) -> Interrupt:
        interrupt.status = status
        await self.session.flush()
        return interrupt

    async def update_status(self, request_id: str, status: InterruptStatus) -> Interrupt:
        interrupt = await self.get_by_request_id(request_id)
        if interrupt is None:
            raise ValueError("审核请求不存在")
        return await self.set_status(interrupt, status)
