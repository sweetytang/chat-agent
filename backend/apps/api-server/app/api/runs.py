from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.core.security import get_optional_subject
from app.db.session import get_optional_db_session
from app.modules.runs.dependencies import run_dependencies_manager
from app.modules.runs.repository import RunRepository
from app.modules.runs.schemas import ResumeRequest, RunRequest
from app.modules.runs.service import run_service
from app.modules.threads.repository import ThreadRepository

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("/stream")
async def stream_run(
    request: RunRequest,
    user_id: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    run_dependencies = run_dependencies_manager.get_run_dependencies()
    run_id = str(uuid4())
    user_id = to_uuid(user_id)
    run_dependencies.run_coordination.register_cancel_event(run_id)

    # 🌟 路径 1：未登录游客 -> 走独立的匿名纯内存流
    if user_id is None or session is None:
        return StreamingResponse(
            run_service.stream_anonymous_run(run_id, request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 🌟 路径 2：已登录用户 -> 走严谨的数据库持久化流
    try:
        thread_id = to_uuid(request.thread_id)
        thread = (
            await ThreadRepository(session).get_owned(thread_id, user_id)
            if thread_id is not None
            else None
        )
        if thread is None:
            raise HTTPException(status_code=404, detail="线程不存在")
        run_context = await run_service.prepare_run_context(
            session,
            UUID(run_id),
            request,
            thread,
        )
    except ValueError, OSError, RuntimeError:
        await session.rollback()

    # 核心流式响应：直接调用 run_service.stream_run
    return StreamingResponse(
        run_service.stream_run(
            session,
            user_id,
            run_id,
            request,
            run_context,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_run(
    run_id: str,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> dict[str, str]:
    subject = to_uuid(subject)
    await RunRepository(session).get_owned(to_uuid(run_id), subject)
    if not run_service.cancel_run(run_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运行不存在")
    return {"run_id": run_id, "status": "cancelling"}


@router.post("/{run_id}/resume")
async def resume_run(
    run_id: str,
    resume_request: ResumeRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    if session is None:
        raise HTTPException(status_code=503, detail="持久化服务不可用")

    return StreamingResponse(
        (
            await run_service.stream_resume(
                session,
                run_id,
                resume_request,
                to_uuid(subject),
            )
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
