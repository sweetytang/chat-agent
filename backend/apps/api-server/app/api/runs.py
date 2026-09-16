from __future__ import annotations

import base64
import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.core.config import get_settings
from app.core.security import get_optional_subject
from app.db.models import McpServerDefinition
from app.db.session import get_optional_db_session
from app.modules.checkpoints.repository import CheckpointRepository
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot, load_mcp_snapshots
from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.dependencies import get_mcp_host
from app.modules.runs.dependencies import run_dependencies_manager
from app.modules.runs.repository import RunRepository
from app.modules.runs.schemas import PendingReview, ResumeRequest, RunContext, RunRequest
from app.modules.runs.service import run_service
from app.modules.threads.repository import ThreadRepository
from app.modules.timeline.domain import get_latest_user_content

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _decode_mcp_credentials(encrypted: str | None) -> dict[str, str]:
    if encrypted is None:
        return {}
    key_text = get_settings().mcp_encryption_key
    if not key_text:
        raise ValueError("MCP 凭据加密未配置")
    value = json.loads(
        CredentialCrypto(base64.urlsafe_b64decode(key_text.encode())).decrypt(encrypted)
    )
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise ValueError("MCP 凭据不可用")
    return value


@router.post("/stream")
async def stream_run(
    request: RunRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    run_dependencies = run_dependencies_manager.configure_run_dependencies()
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
            mcp_host = get_mcp_host()
            if mcp_host is not None:

                async def mcp_loader() -> tuple[McpToolSnapshot, ...]:
                    return tuple(
                        await load_mcp_snapshots(
                            session,
                            subject,
                            mcp_host,
                            _decode_mcp_credentials,
                        )
                    )
    except ValueError, OSError, RuntimeError:
        if session is not None:
            await session.rollback()

    # 核心流式响应：直接调用 run_service.stream_run
    return StreamingResponse(
        run_service.stream_run(
            target_session,
            run_id,
            request,
            run_context,
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
    run_dependencies = run_dependencies_manager.configure_run_dependencies()
    run_coordination = run_dependencies.run_coordination
    subject = to_uuid(subject)
    pending_review = run_coordination.get_pending_review(resume_request.request_id)
    # 纯内存 demo interrupt 没有 run_context，不应为了鉴权主动连接数据库。
    # 持久化 interrupt 或服务重启后的恢复才查询 run 所有者。
    requires_persistence = pending_review is None or pending_review.persisted
    persisted_run = None
    if requires_persistence:
        if session is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        persisted_run = await RunRepository(session).get_owned(to_uuid(run_id), subject)
        if persisted_run is None:
            raise HTTPException(status_code=404, detail="运行不存在")
    # 1. 如果内存里没有pending_review，从数据库的 Checkpoint 和 Interrupt 记录中，完整重建真实的执行上下文
    # 因为如果服务重启或路由到新实例，内存里的 pending_review 会是 None。
    if pending_review is None and session is not None and persisted_run is not None:
        interrupt = await InterruptRepository(session).get_by_request_id(resume_request.request_id)
        if interrupt is not None and str(interrupt.run_id) == run_id:
            # 1. 重建 Checkpoint 上下文 (包含 input_checkpoint)
            checkpoint = None
            input_checkpoint = None
            if interrupt.checkpoint_id is not None:
                checkpoint = await CheckpointRepository(session).get(
                    persisted_run.thread_id,
                    interrupt.checkpoint_id,
                )
                if checkpoint is not None and checkpoint.parent_id is not None:
                    input_checkpoint = await CheckpointRepository(session).get(
                        persisted_run.thread_id,
                        checkpoint.parent_id,
                    )
            run_context = (
                RunContext(checkpoint=checkpoint, input_checkpoint=input_checkpoint)
                if checkpoint is not None
                else None
            )

            # 2. 从真实的 checkpoint timeline 中提取用户当时的真实提问文本，绝不伪造
            original_user_content = (
                get_latest_user_content(run_context.timeline) if run_context is not None else ""
            )
            tool_call_id = str(interrupt.payload.get("tool_call_id") or resume_request.request_id)
            arguments = interrupt.payload.get("arguments")
            if not isinstance(arguments, dict):
                arguments = {}

            # 3. 处理 MCP 工具快照恢复
            mcp_snapshot = None
            if interrupt.kind == "mcp_tool":
                server_id = interrupt.payload.get("server_id")
                tool_name = interrupt.payload.get("tool")
                security_version = interrupt.payload.get("security_version")
                try:
                    server = await session.get(McpServerDefinition, UUID(str(server_id)))
                except ValueError, TypeError:
                    server = None

                mcp_host = get_mcp_host()
                if (
                    server is None
                    or server.security_version != security_version
                    or server.deleted_at is not None
                    or mcp_host is None
                    or subject is None
                ):
                    raise HTTPException(
                        status_code=409,
                        detail="MCP 安全配置已变化，审核请求已失效",
                    )

                mcp_snapshots = await load_mcp_snapshots(
                    session,
                    subject,
                    mcp_host,
                    _decode_mcp_credentials,
                )
                mcp_snapshot = next(
                    (item for item in mcp_snapshots if item.identity.internal_name == tool_name),
                    None,
                )
                if mcp_snapshot is None:
                    raise HTTPException(status_code=409, detail="MCP 工具已不可用")

            # 4. 一体化构造规范、完整、不缺斤少两的 PendingReview
            pending_review = PendingReview(
                run_id=run_id,
                request=RunRequest(
                    thread_id=str(persisted_run.thread_id),
                    content=original_user_content,
                ),
                run_context=run_context,
                persisted=True,
                mcp_snapshot=mcp_snapshot,
                arguments=arguments,
                tool_call_id=tool_call_id,
            )
    # 2. 基础校验
    if pending_review is None or pending_review.run_id != run_id:
        raise HTTPException(status_code=409, detail="审核请求不存在或已过期")

    # 3. 校验 MCP 安全快照
    if pending_review.mcp_snapshot is not None:
        if session is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        try:
            server_id = UUID(pending_review.mcp_snapshot.identity.server_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail="MCP 审核快照无效") from error
        server = await session.get(McpServerDefinition, server_id)
        if (
            server is None
            or server.security_version != pending_review.mcp_snapshot.security_version
            or server.deleted_at is not None
        ):
            raise HTTPException(status_code=409, detail="MCP 安全配置已变化，审核请求已失效")

    run_coordination.remove_pending_review(resume_request.request_id)

    return StreamingResponse(
        (
            await run_service.stream_resume(
                resume_request,
                pending_review,
                session=session,
            )
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
