from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_subject
from app.db.session import get_db_session
from app.modules.threads.repository import ThreadRepository
from app.modules.threads.schemas import CreateThreadRequest, MessageResponse, ThreadResponse

router = APIRouter(prefix="/api/threads", tags=["threads"])


def current_user_id(subject: str = Depends(get_subject)) -> UUID:
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效用户身份") from error


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
    threads = await ThreadRepository(session).list_owned(user_id)
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


@router.get("/{thread_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    thread_id: UUID,
    user_id: UUID = Depends(current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> list[MessageResponse]:
    repository = ThreadRepository(session)
    if await repository.get_owned(thread_id, user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="线程不存在")
    return [MessageResponse.model_validate(item) for item in await repository.list_messages(thread_id)]
