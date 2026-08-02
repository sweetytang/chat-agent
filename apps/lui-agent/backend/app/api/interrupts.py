from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_subject
from app.db.models import InterruptStatus
from app.db.session import get_db_session
from app.modules.interrupts.repository import InterruptRepository

router = APIRouter(prefix="/api/interrupts", tags=["interrupts"])


class CreateInterruptRequest(BaseModel):
    run_id: UUID
    request_id: str = Field(min_length=1, max_length=255)
    kind: str = Field(min_length=1, max_length=100)
    payload: dict[str, Any] = Field(default_factory=dict)
    checkpoint_id: UUID | None = None


class ResolveInterruptRequest(BaseModel):
    decision: str = Field(pattern="^(approve|edit|reject)$")
    payload: dict[str, Any] | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_interrupt(
    request: CreateInterruptRequest,
    _: str = Depends(get_subject),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    interrupt = await InterruptRepository(session).create(
        request.run_id,
        request.request_id,
        request.kind,
        request.payload,
        request.checkpoint_id,
    )
    await session.commit()
    return {"request_id": interrupt.request_id, "status": interrupt.status.value}


@router.post("/{request_id}/resolve")
async def resolve_interrupt(
    request_id: str,
    request: ResolveInterruptRequest,
    _: str = Depends(get_subject),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    status_by_decision = {
        "approve": InterruptStatus.APPROVED,
        "edit": InterruptStatus.EDITED,
        "reject": InterruptStatus.REJECTED,
    }
    try:
        interrupt = await InterruptRepository(session).update_status(
            request_id, status_by_decision[request.decision]
        )
        if request.payload is not None:
            interrupt.payload = request.payload
        await session.commit()
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"request_id": interrupt.request_id, "status": interrupt.status.value}


@router.post("/{request_id}/resume")
async def resume_interrupt(
    request_id: str,
    _: str = Depends(get_subject),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    try:
        interrupt = await InterruptRepository(session).update_status(request_id, InterruptStatus.RESUMED)
        await session.commit()
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"request_id": interrupt.request_id, "status": interrupt.status.value}
