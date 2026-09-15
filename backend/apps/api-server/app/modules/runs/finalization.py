"""为整个 runs 模块统一处理“运行终止、异常失败持久化"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Run, RunStatus
from app.modules.timeline.recorder import TimelineRecorder
from lui_agent_runtime.events import RuntimeEvent
from app.common.utils.to_uuid import to_uuid
from .repository import RunRepository
from .schemas import RunRequest, RunContext


async def finalize_incomplete_stream(
    run_id: str,
    request: RunRequest,
    session: AsyncSession | None,
    run_context: RunContext | None,
    *,
    cancel_requested: bool,
    interrupted_is_terminal: bool,
) -> None:
    if session is None or run_context is None or run_context.checkpoint is None:
        return

    parsed_run_id = to_uuid(run_id)
    run_instance = await session.get(Run, parsed_run_id) if parsed_run_id is not None else None
    terminal_statuses = {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
    if interrupted_is_terminal:
        terminal_statuses.add(RunStatus.INTERRUPTED)
    # 1. 如果任务已经走完了正常生命周期（COMPLETED/FAILED/INTERRUPED），直接放行
    if run_instance is None or run_instance.status in terminal_statuses:
        return

    # 2.推送消息通知前端
    timeline_recorder = TimelineRecorder(
        checkpoint=run_context.checkpoint,
        session=session,
    )
    sequence = timeline_recorder.next_sequence
    timeline_recorder.record(run_id, request.thread_id, sequence, "run.cancelled")
    error_message = "连接已中断，已保留部分内容，请重试" if not cancel_requested else None
    if error_message is not None:
        timeline_recorder.record(
            run_id,
            request.thread_id,
            sequence + 1,
            "run.failed",
            item_id=f"{run_id}:disconnected",
            error=error_message,
        )
    # 3.运行状态置为CANCELLED
    await RunRepository(session).update_status(
        parsed_run_id,
        RunStatus.CANCELLED,
        error_message=error_message,
    )
    await timeline_recorder.flush()


async def mark_run_failure(
    run_id: str,
    thread_id: str,
    message: str,
    session: AsyncSession | None,
    run_context: RunContext | None,
) -> RuntimeEvent:
    if session is None or run_context is None or run_context.checkpoint is None:
        return RuntimeEvent(1, "run.failed", run_id, thread_id, 1, error=message)

    timeline_recorder = TimelineRecorder(
        checkpoint=run_context.checkpoint,
        session=session,
    )
    sequence = timeline_recorder.next_sequence
    event = timeline_recorder.record(
        run_id,
        thread_id,
        sequence,
        "run.failed",
        item_id=f"{run_id}:resume-error:{sequence}",
        error=message,
    )
    await RunRepository(session).update_status(
        UUID(run_id), RunStatus.FAILED, error_message=message
    )
    await timeline_recorder.flush()
    return event
