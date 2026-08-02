from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Interrupt, InterruptStatus


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
            id=uuid4(),
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
        from sqlalchemy import select

        result = await self.session.execute(
            select(Interrupt).where(Interrupt.request_id == request_id)
        )
        return result.scalar_one_or_none()

    async def update_status(self, request_id: str, status: InterruptStatus) -> Interrupt:
        interrupt = await self.get_by_request_id(request_id)
        if interrupt is None:
            raise ValueError("审核请求不存在")
        interrupt.status = status
        await self.session.flush()
        return interrupt
