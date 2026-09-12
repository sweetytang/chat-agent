from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator
from dataclasses import replace
import json
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_optional_subject
from app.db.models import McpServerDefinition, Run, Thread
from app.db.session import get_optional_db_session
from app.integrations.llm.config import get_provider_config
from app.integrations.llm.factory import create_chat_model
from app.integrations.llm.fake import FakeChatModel
from app.modules.checkpoints.service import (
    RunBranchContext,
    Checkpoint,
    create_run_branch,
)
from app.modules.timeline.domain import checkpoint_timeline
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot, load_mcp_snapshots
from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.host import McpHost, McpHostError
from app.modules.runs.context import RunDependencies
from app.modules.runs.finalization import finalize_incomplete_stream, persist_run_failure
from app.modules.runs.repository import RunRepository
from app.modules.runs.resume import resumed_run_events as _resumed_run_events
from app.modules.runs.schemas import PendingReview, ResumeRequest, RunRequest
from app.modules.runs.streaming import run_events as _run_events
from app.modules.checkpoints.repository import CheckpointRepository
from app.modules.timeline.projector import conversation_messages
from app.modules.timeline.domain import empty_timeline
from lui_agent_runtime.driver import LangGraphAgentDriver
from lui_agent_runtime.events import BusinessEvent
from lui_agent_runtime.graph.runtime import stream_graph_events
from lui_agent_runtime.tools.langchain import default_langchain_tools
from lui_agent_runtime.tools.registry import calculate

router = APIRouter(prefix="/api/runs", tags=["runs"])

_thread_locks: dict[str, asyncio.Lock] = {}
_cancel_events: dict[str, asyncio.Event] = {}


_pending_reviews: dict[str, PendingReview] = {}
_mcp_host: McpHost | None = None


def configure_mcp_host(host: McpHost | None) -> None:
    global _mcp_host
    _mcp_host = host


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


def _thread_lock(thread_id: str) -> asyncio.Lock:
    return _thread_locks.setdefault(thread_id, asyncio.Lock())


def _event(run_id: str, thread_id: str, sequence: int, name: str, **data: object) -> BusinessEvent:
    return BusinessEvent(1, name, run_id, thread_id, sequence, data)


def _run_dependencies() -> RunDependencies:
    """由 API 边界装配当前进程实现，运行模块不反向依赖路由。"""

    return RunDependencies(
        cancel_events=_cancel_events,
        thread_lock=_thread_lock,
        event=_event,
        pending_reviews=_pending_reviews,
        mcp_host=lambda: _mcp_host,
        calculate=calculate,
        get_provider_config=get_provider_config,
        create_chat_model=create_chat_model,
        fake_chat_model=FakeChatModel,
        default_langchain_tools=default_langchain_tools,
        agent_driver=lambda: LangGraphAgentDriver(stream_graph_events),
    )


def run_events(*args: Any, **kwargs: Any) -> Any:
    """兼容旧导入，同时在进入运行模块前完成依赖装配。"""

    kwargs.setdefault("dependencies", _run_dependencies())
    return _run_events(*args, **kwargs)


def resumed_run_events(*args: Any, **kwargs: Any) -> Any:
    """兼容旧导入，同时在进入恢复模块前完成依赖装配。"""

    kwargs.setdefault("dependencies", _run_dependencies())
    return _resumed_run_events(*args, **kwargs)


def _required_user_id(subject: str | None) -> UUID:
    if subject is None:
        raise HTTPException(status_code=401, detail="需要登录后访问该资源")
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="无效用户身份") from error


def _require_thread_owner(thread: Thread, subject: str | None) -> None:
    if thread.user_id != _required_user_id(subject):
        raise HTTPException(status_code=404, detail="线程不存在")


async def _persisted_run(
    session: AsyncSession | None,
    run_id: str,
) -> Run | None:
    if session is None:
        return None
    try:
        parsed_run_id = UUID(run_id)
    except ValueError:
        return None
    return await session.get(Run, parsed_run_id)


async def _require_run_owner(
    session: AsyncSession,
    run: Run,
    subject: str | None,
) -> None:
    user_id = _required_user_id(subject)
    thread = await session.get(Thread, run.thread_id)
    if thread is None or thread.user_id != user_id:
        raise HTTPException(status_code=404, detail="运行不存在")


async def _load_branch_base(
    session: AsyncSession,
    thread: Thread,
    checkpoint_id: UUID | None,
    *,
    use_current_if_none: bool = True,
) -> Checkpoint | None:
    base_checkpoint_id = (
        thread.current_checkpoint_id
        if checkpoint_id is None and use_current_if_none # 分辨是否是第一条消息
        else checkpoint_id
    )
    if base_checkpoint_id is None:
        return None

    checkpoint = await CheckpointRepository(session).get(thread.id, base_checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="checkpoint 不存在")
    return checkpoint


async def _prepare_persisted_run(
    session: AsyncSession,
    run_id: UUID,
    request: RunRequest,
    thread: Thread,
) -> RunBranchContext | None:
    parent_checkpoint = await _load_branch_base(
        session,
        thread,
        request.checkpoint_id,
        use_current_if_none="checkpoint_id" not in request.model_fields_set,
    )
    if request.mode == "regenerate" and (
        parent_checkpoint is None
        or conversation_messages(checkpoint_timeline(parent_checkpoint))[-1].get("role") != "user"
    ):
        raise HTTPException(status_code=400, detail="重新生成必须指定用户消息 checkpoint")
    
    await RunRepository(session).create(thread.id, run_id=run_id)
    branch_context = await create_run_branch(
        session,
        thread,
        run_id=run_id,
        mode=request.mode,
        content=request.content,
        parent_checkpoint= parent_checkpoint
    )
    await session.commit()
    return branch_context


async def safe_resumed_run_events(*args: Any, **kwargs: Any) -> AsyncIterator[str]:
    """恢复流的最后一道边界，避免未捕获异常直接表现为浏览器 network error。"""
    run_id = str(args[0]) if args else str(kwargs.get("run_id", "unknown"))
    request = args[1] if len(args) > 1 else kwargs.get("request")
    thread_id = getattr(request, "thread_id", "")
    session: AsyncSession | None = args[4] if len(args) > 4 else kwargs.get("session")
    branch_context: RunBranchContext | None = (
        args[5] if len(args) > 5 else kwargs.get("branch_context")
    )

    try:
        async for event in resumed_run_events(*args, **kwargs):
            yield event
    except McpHostError as error:
        yield (
            await persist_run_failure(
                run_id, thread_id, str(error), session, branch_context, _event
            )
        ).to_sse()
    except Exception as error:
        yield (
            await persist_run_failure(
                run_id,
                thread_id,
                f"MCP 恢复失败（{type(error).__name__}）",
                session,
                branch_context,
                _event,
            )
        ).to_sse()


async def _finalize_incomplete_stream(
    run_id: str,
    request: RunRequest,
    session: AsyncSession | None,
    branch_context: RunBranchContext | None,
    *,
    interrupted_is_terminal: bool,
) -> None:
    """连接提前关闭时，将已投影的部分内容固化为可重试终态。"""

    await finalize_incomplete_stream(
        run_id,
        request,
        session,
        branch_context,
        event_factory=_event,
        cancel_requested=_cancel_events.get(run_id, asyncio.Event()).is_set(),
        interrupted_is_terminal=interrupted_is_terminal,
    )


async def _managed_run_stream(
    events: AsyncIterator[str],
    *,
    run_id: str,
    request: RunRequest,
    session: AsyncSession | None,
    branch_context: RunBranchContext | None,
    interrupted_is_terminal: bool = True,
) -> AsyncIterator[str]:
    try:
        async for event in events:
            yield event
    finally:
        try:
            await _finalize_incomplete_stream(
                run_id,
                request,
                session,
                branch_context,
                interrupted_is_terminal=interrupted_is_terminal,
            )
        finally:
            _cancel_events.pop(run_id, None)


@router.post("/stream")
async def stream_run(
    request: RunRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    run_id = str(uuid4())
    _cancel_events[run_id] = asyncio.Event()
    persistence_session: AsyncSession | None = None
    branch_context: RunBranchContext | None = None
    try:

        if session is not None:
            try:
                thread_id = UUID(request.thread_id)
            except ValueError:
                thread_id = None
            thread = await session.get(Thread, thread_id) if thread_id is not None else None
            if thread is not None:
                _require_thread_owner(thread, subject)
                branch_context = await _prepare_persisted_run(
                    session,
                    UUID(run_id),
                    request,
                    thread,
                )
        if branch_context is not None:
            persistence_session = session
    except (ValueError, OSError, RuntimeError):
        if session is not None:
            await session.rollback()
    mcp_loader = None
    if persistence_session is not None and _mcp_host is not None and subject is not None:

        async def mcp_loader() -> tuple[McpToolSnapshot, ...]:
            return tuple(
                await load_mcp_snapshots(
                    persistence_session,
                    UUID(subject),
                    _mcp_host,
                    _decode_mcp_credentials,
                )
            )

    return StreamingResponse(
        _managed_run_stream(
            run_events(
                run_id,
                request,
                persistence_session,
                branch_context,
                mcp_loader=mcp_loader,
            ),
            run_id=run_id,
            request=request,
            session=persistence_session,
            branch_context=branch_context,
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
    run = await _persisted_run(session, run_id)
    if run is not None and session is not None:
        await _require_run_owner(session, run, subject)
    cancel_event = _cancel_events.get(run_id)
    if cancel_event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运行不存在")
    cancel_event.set()
    return {"run_id": run_id, "status": "cancelling"}


@router.post("/{run_id}/resume")
async def resume_run(
    run_id: str,
    request: ResumeRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    pending = _pending_reviews.get(request.request_id)
    # 纯内存 demo interrupt 没有 branch context，不应为了鉴权主动连接数据库。
    # 持久化 interrupt 或服务重启后的恢复才查询 run 所有者。
    requires_persistence = pending is None or pending.persisted
    persisted_run = None
    if requires_persistence:
        if session is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        persisted_run = await _persisted_run(session, run_id)
        if persisted_run is None:
            raise HTTPException(status_code=404, detail="运行不存在")
        await _require_run_owner(session, persisted_run, subject)
    if pending is None and session is not None:
        interrupt = await InterruptRepository(session).get_by_request_id(request.request_id)
        if interrupt is not None and persisted_run is not None and str(interrupt.run_id) == run_id:
            query = str(interrupt.payload.get("query", ""))
            branch_context = (
                RunBranchContext(interrupt.checkpoint_id, empty_timeline())
                if interrupt.checkpoint_id is not None
                else None
            )
            pending = PendingReview(
                run_id,
                RunRequest(thread_id=str(persisted_run.thread_id), content=f"search: {query}"),
                branch_context,
                persisted=True,
                tool_call_id=str(interrupt.payload.get("tool_call_id") or request.request_id),
            )
            if interrupt.kind == "mcp_tool":
                server_id = interrupt.payload.get("server_id")
                tool_name = interrupt.payload.get("tool")
                security_version = interrupt.payload.get("security_version")
                arguments = interrupt.payload.get("arguments")
                try:
                    server = await session.get(McpServerDefinition, UUID(str(server_id)))
                except ValueError:
                    server = None
                if (
                    server is None
                    or server.security_version != security_version
                    or _mcp_host is None
                    or subject is None
                ):
                    raise HTTPException(
                        status_code=409,
                        detail="MCP 安全配置已变化，审核请求已失效",
                    )
                mcp_snapshots = await load_mcp_snapshots(
                    session,
                    UUID(subject),
                    _mcp_host,
                    _decode_mcp_credentials,
                )
                snapshot = next(
                    (item for item in mcp_snapshots if item.identity.internal_name == tool_name),
                    None,
                )
                if snapshot is None:
                    raise HTTPException(status_code=409, detail="MCP 工具已不可用")
                pending = PendingReview(
                    run_id,
                    RunRequest(
                        thread_id=str(persisted_run.thread_id),
                        content="MCP 工具审核",
                    ),
                    branch_context,
                    persisted=True,
                    mcp_snapshot=snapshot,
                    arguments=arguments if isinstance(arguments, dict) else {},
                    tool_call_id=str(interrupt.payload.get("tool_call_id") or request.request_id),
                )
    if pending is None or pending.run_id != run_id:
        raise HTTPException(status_code=409, detail="审核请求不存在或已过期")
    if pending.persisted:
        if session is None or persisted_run is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        if pending.branch_context is None:
            raise HTTPException(status_code=409, detail="审核 checkpoint 已失效")
        checkpoint = await CheckpointRepository(session).get(
            persisted_run.thread_id,
            pending.branch_context.checkpoint_id,
        )
        if checkpoint is None:
            raise HTTPException(status_code=409, detail="审核 checkpoint 已失效")
        try:
            timeline = checkpoint_timeline(checkpoint)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        pending = replace(
            pending,
            branch_context=RunBranchContext(
                checkpoint.id,
                timeline,
                checkpoint=checkpoint,
            ),
        )
    if pending.mcp_snapshot is not None:
        if session is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        try:
            server_id = UUID(pending.mcp_snapshot.identity.server_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail="MCP 审核快照无效") from error
        server = await session.get(McpServerDefinition, server_id)
        if (
            server is None
            or server.security_version != pending.mcp_snapshot.security_version
            or server.deleted_at is not None
        ):
            raise HTTPException(status_code=409, detail="MCP 安全配置已变化，审核请求已失效")
    _pending_reviews.pop(request.request_id, None)
    return StreamingResponse(
        _managed_run_stream(
            safe_resumed_run_events(
                run_id,
                pending.request,
                request.request_id,
                request.decision,
                session,
                pending.branch_context,
                pending,
                request.payload,
            ),
            run_id=run_id,
            request=pending.request,
            session=session,
            branch_context=pending.branch_context,
            interrupted_is_terminal=False,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
