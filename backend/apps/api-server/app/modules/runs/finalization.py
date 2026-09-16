"""为整个 runs 模块统一处理“运行终止、异常失败持久化"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.db.models import Checkpoint, Run, RunStatus
from app.modules.timeline.recorder import TimelineRecorder
from lui_agent_runtime.events import RuntimeEvent

from .repository import RunRepository
from .schemas import RunRequest


async def finalize_incomplete_stream(
    run_id: str,
    request: RunRequest,
    *,
    session: AsyncSession | None = None,
    current_checkpoint: Checkpoint | None = None,
    cancel_requested: bool,
    interrupted_is_terminal: bool,
):
    if session is None:
        raise ValueError("finalize_run need session")

    parsed_run_id = to_uuid(run_id)
    current_run = await session.get(Run, parsed_run_id) if parsed_run_id is not None else None
    terminal_statuses = {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
    if interrupted_is_terminal:
        terminal_statuses.add(RunStatus.INTERRUPTED)
    # 如果任务已经走完了正常生命周期（COMPLETED/FAILED/INTERRUPED），直接放行
    if current_run is None or current_run.status in terminal_statuses:
        return

    status = RunStatus.CANCELLED if cancel_requested else RunStatus.FAILED
    error_message = None if cancel_requested else "网络连接中断，已保留部分生成内容"
    await finalize_run(
        run_id,
        request.thread_id,
        session=session,
        current_checkpoint=current_checkpoint,
        status=status,
        error_message=error_message,
    )


async def finalize_run(
    run_id: str,
    thread_id: str,
    *,
    session: AsyncSession | None = None,
    current_checkpoint: Checkpoint | None = None,
    status: RunStatus = RunStatus.COMPLETED,
    error_message: str | None = None,
    sequence: int | None = None,
    event_data: dict[str, any] | None = None,
) -> RuntimeEvent:
    """终结run至终态，并事件通知前端"""

    if session is None or current_checkpoint is None:
        raise ValueError("finalize_run need session and checkpoint")

    timeline_recorder = TimelineRecorder(
        checkpoint=current_checkpoint,
        session=session,
    )
    if sequence is None:
        sequence = timeline_recorder.next_sequence
    final_event = timeline_recorder.record(
        run_id, thread_id, sequence, f"run.{status.lower()}", *(event_data or {})
    )
    if session is not None:
        await RunRepository(session).update_status(
            UUID(run_id), status, error_message=error_message
        )
        await timeline_recorder.flush()
    return final_event
