from collections.abc import Callable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Run, RunStatus
from app.modules.timeline.recorder import TimelineRecorder
from app.modules.timeline.domain import get_next_sequence
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
    try:
        parsed_run_id = UUID(run_id)
    except ValueError:
        return
    run = await session.get(Run, parsed_run_id)
    terminal_statuses = {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
    if interrupted_is_terminal:
        terminal_statuses.add(RunStatus.INTERRUPTED)
    if run is None or run.status in terminal_statuses:
        return

    timeline_recorder = TimelineRecorder(
        checkpoint=run_context.checkpoint,
        session=session,
    )
    sequence = get_next_sequence(timeline_recorder)
    timeline_recorder.record(run_id, request.thread_id, sequence, "run.cancelled")
    error_message = None if cancel_requested else "连接已中断，已保留部分内容，请重试"
    if error_message is not None:
        timeline_recorder.record(
            run_id,
            request.thread_id,
            sequence + 1,
            "run.failed",
            item_id=f"{run_id}:disconnected",
            error=error_message,
        )
    await RunRepository(session).update_status(
        parsed_run_id,
        RunStatus.CANCELLED,
        error_message=error_message,
    )
    await timeline_recorder.flush()
