from __future__ import annotations

from functools import partial
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.core.security import get_optional_subject
from app.db.session import get_optional_db_session
from app.modules.mcp.agent import load_mcp_snapshots
from app.modules.runs.dependencies import run_dependencies_manager
from app.modules.runs.repository import RunRepository
from app.modules.runs.schemas import ResumeRequest, RunContext, RunRequest
from app.modules.runs.service import run_service
from app.modules.threads.repository import ThreadRepository

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("/stream")
async def stream_run(
    request: RunRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    run_dependencies = run_dependencies_manager.get_run_dependencies()
    run_coordination = run_dependencies.run_coordination
    run_id = str(uuid4())
    subject = to_uuid(subject)
    run_coordination.register_cancel_event(run_id)
    run_context: RunContext | None = None
    target_session: AsyncSession | None = None
    mcp_loader = None
    try:
        # 只允许认证用户去数据库加载持久化线程
        if session is not None and subject is not None:
            target_session = session
            thread_id = to_uuid(request.thread_id)
            thread = (
                await ThreadRepository(session).get_owned(thread_id, subject)
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
            # MCP 只有登录用户才有配置，直接在此就绪
            mcp_host = run_dependencies.get_mcp_host()
            if mcp_host is not None:
                mcp_loader = partial(load_mcp_snapshots, session, subject, mcp_host)

    except ValueError, OSError, RuntimeError:
        if session is not None:
            await session.rollback()

    # 核心流式响应：直接调用 run_service.stream_run
    return StreamingResponse(
        run_service.stream_run(
            run_id,
            request,
            run_context,
            session=target_session,
            mcp_loader=mcp_loader,
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
                run_id,
                resume_request,
                to_uuid(subject),
                session=session,
            )
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
