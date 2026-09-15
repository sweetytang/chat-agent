from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .dependencies import current_user_uuid
from app.db.models import InterruptStatus
from app.db.session import get_db_session
from app.modules.interrupts.repository import InterruptRepository
from app.modules.runs.repository import RunRepository
from app.modules.threads.repository import ThreadRepository
from app.modules.checkpoints.repository import CheckpointRepository

router = APIRouter(prefix="/api/interrupts", tags=["interrupts"])
thread_router = APIRouter(
    prefix="/api/threads/{thread_id}/interrupts",
    tags=["interrupts"],
)


class CreateInterruptRequest(BaseModel):
    run_id: UUID
    request_id: str = Field(min_length=1, max_length=255)
    kind: str = Field(min_length=1, max_length=100)
    payload: dict[str, Any] = Field(default_factory=dict)
    checkpoint_id: UUID | None = None


class ResolveInterruptRequest(BaseModel):
    decision: str = Field(pattern="^(approve|edit|reject)$")
    payload: dict[str, Any] | None = None


class PendingInterruptResponse(BaseModel):
    request_id: str
    run_id: UUID
    kind: str
    tool: str | None
    payload: dict[str, Any]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_interrupt(
    request: CreateInterruptRequest,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    run = await RunRepository(session).get_owned(request.run_id, user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="运行不存在")
    if (
        request.checkpoint_id is not None
        and await CheckpointRepository(session).get(
            run.thread_id,
            request.checkpoint_id,
        )
        is None
    ):
        raise HTTPException(status_code=404, detail="checkpoint 不存在")
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
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    status_by_decision = {
        "approve": InterruptStatus.APPROVED,
        "edit": InterruptStatus.EDITED,
        "reject": InterruptStatus.REJECTED,
    }
    repository = InterruptRepository(session)
    interrupt = await repository.get_owned_by_request_id(request_id, user_id)
    if interrupt is None:
        raise HTTPException(status_code=404, detail="审核请求不存在")
    await repository.set_status(interrupt, status_by_decision[request.decision])
    if request.payload is not None:
        interrupt.payload = request.payload
    await session.commit()
    return {"request_id": interrupt.request_id, "status": interrupt.status.value}


@router.post("/{request_id}/resume")
async def resume_interrupt(
    request_id: str,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    repository = InterruptRepository(session)
    interrupt = await repository.get_owned_by_request_id(request_id, user_id)
    if interrupt is None:
        raise HTTPException(status_code=404, detail="审核请求不存在")
    await repository.set_status(interrupt, InterruptStatus.RESUMED)
    await session.commit()
    return {"request_id": interrupt.request_id, "status": interrupt.status.value}


@thread_router.get("/pending", response_model=PendingInterruptResponse | None)
async def get_pending_interrupt(
    thread_id: UUID,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> PendingInterruptResponse | None:
    if await ThreadRepository(session).get_owned(thread_id, user_id) is None:
        raise HTTPException(status_code=404, detail="线程不存在")
    interrupt = await InterruptRepository(session).get_pending_for_thread(thread_id)
    if interrupt is None:
        return None
    tool = interrupt.payload.get("tool")
    return PendingInterruptResponse(
        request_id=interrupt.request_id,
        run_id=interrupt.run_id,
        kind=interrupt.kind,
        tool=tool if isinstance(tool, str) else None,
        payload=interrupt.payload,
    )
