"""运行时的中断与审批服务。"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RunStatus
from app.modules.interrupts.repository import InterruptRepository
from app.modules.timeline.recorder import TimelineRecorder
from lui_agent_runtime.events import RuntimeEvent

from .repository import RunRepository
from .schemas import RunContext, RunRequest


async def create_approval_interrupt(
    session: AsyncSession | None,
    timeline_recorder: TimelineRecorder,
    *,
    run_id: str,
    request: RunRequest,
    run_context: RunContext | None,
    sequence: int,
    kind: str,
    tool_name: str,
    arguments: dict[str, Any],
    extra_payload: dict[str, Any] | None = None,
    tool_call_id: str | None = None,
) -> tuple[RuntimeEvent, RuntimeEvent, int]:
    """创建审批中断。

    统一处理：
    1. 持久化模式下向数据库插入 Interrupt 实体并置 Run 为 INTERRUPTED
    2. 生成并记录 tool.call 与 tool.approval_required 两个时间线事件

    返回: (tool_call_event, approval_event, next_sequence)
    """
    request_id = str(uuid4())  # 用于resume请求中查找interrupt数据
    tool_call_id = tool_call_id or request_id

    # 1. 数据库持久化处理
    if session is not None:
        payload = {
            "tool": tool_name,
            "arguments": arguments,
            "tool_call_id": tool_call_id,
            **(extra_payload or {}),
        }
        await InterruptRepository(session).create(
            UUID(run_id),
            request_id,
            kind,
            payload,
            run_context.checkpoint_id if run_context else None,
        )
        await RunRepository(session).update_status(UUID(run_id), RunStatus.INTERRUPTED)

    # 2. 产生并投影两个关联事件
    sequence += 1
    tool_call_event = timeline_recorder.record(
        run_id,
        request.thread_id,
        sequence,
        "tool.call",
        tool=tool_name,
        tool_call_id=tool_call_id,
        request_id=request_id,
        arguments=arguments,
    )

    sequence += 1
    approval_event = timeline_recorder.record(
        run_id,
        request.thread_id,
        sequence,
        "tool.approval_required",
        tool=tool_name,
        tool_call_id=tool_call_id,
        request_id=request_id,
    )

    # 确保时间线快照及时固化
    await timeline_recorder.flush()

    return tool_call_event, approval_event, sequence
