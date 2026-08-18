from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_subject
from app.db.session import get_db_session
from app.modules.checkpoints.service import project_timeline
from app.modules.threads.repository import ThreadRepository
from app.modules.threads.schemas import (
    CreateThreadRequest,
    ThreadResponse,
    UpdateThreadRequest,
)
from app.modules.timeline.schemas import ThreadTimelineResponse, TimelineSnapshotResponse

router = APIRouter(prefix="/api/threads", tags=["threads"])


def current_user_id(subject: str = Depends(get_subject)) -> UUID:
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="无效用户身份"
        ) from error


@router.post("", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    payload: CreateThreadRequest,
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadResponse:
    thread = await ThreadRepository(session).create(user_id, payload.title)
    await session.commit()
    return ThreadResponse.model_validate(thread)


@router.get("", response_model=list[ThreadResponse])
async def list_threads(
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> list[ThreadResponse]:
    repository = ThreadRepository(session)
    threads = await repository.list_owned(user_id)
    return [ThreadResponse.model_validate(thread) for thread in threads]


@router.get("/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: UUID,
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadResponse:
    thread = await ThreadRepository(session).get_owned(thread_id, user_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线程不存在")
    return ThreadResponse.model_validate(thread)


@router.patch("/{thread_id}", response_model=ThreadResponse)
async def update_thread(
    thread_id: UUID,
    payload: UpdateThreadRequest,
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadResponse:
    repository = ThreadRepository(session)
    thread = await repository.get_owned(thread_id, user_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线程不存在")
    await repository.update(thread, title=payload.title, is_pinned=payload.is_pinned)
    await session.commit()
    return ThreadResponse.model_validate(thread)


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: UUID,
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repository = ThreadRepository(session)
    thread = await repository.get_owned(thread_id, user_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线程不存在")
    await repository.delete(thread)
    await session.commit()


@router.get("/{thread_id}/timeline", response_model=ThreadTimelineResponse)
async def get_thread_timeline(
    thread_id: UUID,
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadTimelineResponse:
    repository = ThreadRepository(session)
    thread = await repository.get_owned(thread_id, user_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线程不存在")

    checkpoints = await repository.list_checkpoints(thread_id)
    selected_checkpoint = next(
        (item for item in checkpoints if item.id == thread.current_checkpoint_id),
        None,
    )
    try:
        timeline = project_timeline(selected_checkpoint, checkpoints)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return ThreadTimelineResponse(
        thread_id=thread.id,
        current_checkpoint_id=thread.current_checkpoint_id,
        timeline=TimelineSnapshotResponse.model_validate(timeline),
    )
