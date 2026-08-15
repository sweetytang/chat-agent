from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_subject
from app.db.models import Thread
from app.db.session import get_db_session
from app.modules.threads.repository import ThreadRepository

router = APIRouter(prefix="/api/threads/{thread_id}/checkpoints", tags=["checkpoints"])


class CreateCheckpointRequest(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)
    parent_id: UUID | None = None
    branch_name: str | None = Field(default=None, max_length=255)


class CheckpointResponse(BaseModel):
    id: UUID
    thread_id: UUID
    parent_id: UUID | None
    state: dict[str, Any]
    branch_name: str | None

    model_config = {"from_attributes": True}


def user_uuid(subject: str = Depends(get_subject)) -> UUID:
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="无效用户身份") from error


async def owned_thread(
    thread_id: UUID,
    user_id: UUID,
    session: AsyncSession,
) -> Thread:
    thread = await ThreadRepository(session).get_owned(thread_id, user_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="线程不存在")
    return thread


@router.post("", response_model=CheckpointResponse, status_code=status.HTTP_201_CREATED)
async def create_checkpoint(
    thread_id: UUID,
    request: CreateCheckpointRequest,
    user_id: UUID = Depends(user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> CheckpointResponse:
    repository = ThreadRepository(session)
    thread = await owned_thread(thread_id, user_id, session)
    if (
        request.parent_id is not None
        and await repository.get_checkpoint(thread_id, request.parent_id) is None
    ):
        raise HTTPException(status_code=404, detail="父 checkpoint 不存在")
    checkpoint = await repository.append_checkpoint(
        thread, request.state, request.parent_id, request.branch_name
    )
    await session.commit()
    return CheckpointResponse.model_validate(checkpoint)


@router.get("", response_model=list[CheckpointResponse])
async def list_checkpoints(
    thread_id: UUID,
    user_id: UUID = Depends(user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> list[CheckpointResponse]:
    await owned_thread(thread_id, user_id, session)
    checkpoints = await ThreadRepository(session).list_checkpoints(thread_id)
    return [CheckpointResponse.model_validate(item) for item in checkpoints]


@router.post("/{checkpoint_id}/switch", response_model=CheckpointResponse)
async def switch_checkpoint(
    thread_id: UUID,
    checkpoint_id: UUID,
    user_id: UUID = Depends(user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> CheckpointResponse:
    repository = ThreadRepository(session)
    thread = await owned_thread(thread_id, user_id, session)
    checkpoint = await repository.get_checkpoint(thread_id, checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="checkpoint 不存在")
    await repository.switch_checkpoint(thread, checkpoint)
    await session.commit()
    return CheckpointResponse.model_validate(checkpoint)
