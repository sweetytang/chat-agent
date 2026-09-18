from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RunStatus
from app.modules.mcp.agent import load_mcp_snapshots
from app.modules.timeline.domain import get_latest_user_content, timeline_to_model_messages
from app.modules.timeline.recorder import TimelineRecorder

from .dependencies import run_dependencies_manager
from .driver import invoke_agent_driver
from .repository import RunRepository
from .schemas import RunContext, RunRequest


async def generate_run_events(
    session: AsyncSession,
    user_id: UUID,
    run_id: str,
    request: RunRequest,
    run_context: RunContext,
) -> AsyncIterator[str]:
    """先提供稳定的业务事件协议，再把模型节点接入同一事件出口。"""

    run_dependencies = run_dependencies_manager.get_run_dependencies()
    run_coordination = run_dependencies.run_coordination
    timeline_recorder = TimelineRecorder(
        checkpoint=run_context.checkpoint,
        session=session,
    )

    sequence = 0
    yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.queued").to_sse()

    async with run_coordination.setdefault_chat_lock(request.thread_id):
        if run_coordination.is_cancel_requested(run_id):
            sequence += 1
            yield timeline_recorder.record(
                run_id, request.thread_id, sequence, "run.cancelled"
            ).to_sse()
            return

        sequence += 1
        yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.started").to_sse()

        try:
            mcp_host = run_dependencies.get_mcp_host()
            if mcp_host is not None:
                mcp_snapshots = await load_mcp_snapshots(session, user_id, mcp_host)
        except ValueError, OSError, RuntimeError:
            await session.rollback()
            sequence += 1
            yield (
                timeline_recorder.record(
                    run_id,
                    request.thread_id,
                    sequence,
                    "mcp.error",
                    item_id=f"{run_id}:mcp-error:{sequence}",
                    error="MCP 工具加载失败，请检查 Server 状态并刷新",
                ).to_sse()
            )

        await RunRepository(session).update_status(UUID(run_id), RunStatus.RUNNING)
        await session.commit()

        timeline = run_context.timeline
        input_messages = timeline_to_model_messages(timeline)
        prompt_content = get_latest_user_content(timeline, request.content)

        async for event in invoke_agent_driver(
            session,
            run_id,
            request,
            run_context,
            timeline_recorder,
            sequence,
            input_messages,
            mcp_snapshots=mcp_snapshots,
            prompt_content=prompt_content,
        ):
            yield event
