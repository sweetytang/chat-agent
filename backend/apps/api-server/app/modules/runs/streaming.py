from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RunStatus
from app.modules.mcp.agent import McpToolSnapshot
from app.modules.timeline.domain import extract_conversation_messages, get_latest_user_content
from app.modules.timeline.recorder import TimelineRecorder

from .dependencies import run_dependencies_manager
from .driver import invoke_agent_driver
from .repository import RunRepository
from .schemas import RunContext, RunRequest


async def generate_run_events(
    session: AsyncSession | None,
    run_id: str,
    request: RunRequest,
    run_context: RunContext | None,
    mcp_snapshots: tuple[McpToolSnapshot, ...] = (),
    mcp_load_error: str | None = None,
    mcp_loader: Callable[[], Awaitable[tuple[McpToolSnapshot, ...]]] | None = None,
) -> AsyncIterator[str]:
    """先提供稳定的业务事件协议，再把模型节点接入同一事件出口。"""

    run_dependencies = run_dependencies_manager.configure_run_dependencies()
    run_coordination = run_dependencies.run_coordination
    timeline_recorder = TimelineRecorder(
        checkpoint=run_context.checkpoint if run_context is not None else None,
        session=session,
    )
    sequence = 0
    yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.queued").to_sse()

    async with run_coordination.setdefault_chat_lock(request.thread_id):
        sequence += 1
        if run_coordination.is_cancel_requested(run_id):
            yield timeline_recorder.record(
                run_id, request.thread_id, sequence, "run.cancelled"
            ).to_sse()
            return

        yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.started").to_sse()
        if mcp_loader is not None:
            try:
                mcp_snapshots = await mcp_loader()
            except ValueError, OSError, RuntimeError:
                if session is not None:
                    await session.rollback()
                mcp_load_error = "MCP 工具加载失败，请检查 Server 状态并刷新"
        if mcp_load_error:
            sequence += 1
            yield (
                timeline_recorder.record(
                    run_id,
                    request.thread_id,
                    sequence,
                    "mcp.error",
                    item_id=f"{run_id}:mcp-error:{sequence}",
                    error=mcp_load_error,
                ).to_sse()
            )
        run_repository = RunRepository(session) if session is not None else None
        if run_repository is not None:
            await run_repository.update_status(UUID(run_id), RunStatus.RUNNING)
            await session.commit()

        timeline = run_context.timeline if run_context is not None else timeline_recorder.snapshot
        if run_context is None:  # 匿名 Demo 模式
            timeline["items"].append(  # 手动在内存时间线里，伪造追加一条用户发送的消息！
                {
                    "id": f"{run_id}:user",
                    "kind": "message",
                    "run_id": run_id,
                    "sequence": -1,
                    "logical_message_id": f"{run_id}:user",
                    "role": "user",
                    "content": request.content,
                    "status": "completed",
                    "terminal_segment": True,
                }
            )
        input_messages = extract_conversation_messages(timeline)
        prompt_content = get_latest_user_content(timeline, request.content)

        async for event in invoke_agent_driver(
            session=session,
            run_id=run_id,
            request=request,
            run_context=run_context,
            timeline_recorder=timeline_recorder,
            sequence=sequence,
            input_messages=input_messages,
            mcp_snapshots=mcp_snapshots,
            prompt_content=prompt_content,
        ):
            yield event
