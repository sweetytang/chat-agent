from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .dependencies import current_user_uuid
from app.db.session import get_db_session
from app.modules.threads.service import get_owned_thread
from app.modules.checkpoints.repository import CheckpointRepository
from app.modules.checkpoints.schemas import CheckpointResponse


router = APIRouter(prefix="/api/threads/{thread_id}/checkpoints", tags=["checkpoints"])


@router.get("", response_model=list[CheckpointResponse])
async def list_checkpoints(
    thread_id: UUID,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> list[CheckpointResponse]:
    await get_owned_thread(thread_id, user_id, session)
    checkpoints = await CheckpointRepository(session).list_by_thread(thread_id)
    return [CheckpointResponse.model_validate(item) for item in checkpoints]


@router.post("/{checkpoint_id}/switch", response_model=CheckpointResponse)
async def switch_checkpoint(
    thread_id: UUID,
    checkpoint_id: UUID,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> CheckpointResponse:
    repository = CheckpointRepository(session)
    thread = await get_owned_thread(thread_id, user_id, session)
    checkpoint = await repository.get(thread_id, checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="checkpoint 不存在")
    await repository.switch(thread, checkpoint)
    await session.commit()
    return CheckpointResponse.model_validate(checkpoint)
