"""运行时的中断与审批服务。"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RunStatus
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot
from app.modules.timeline.recorder import TimelineRecorder
from lui_agent_runtime.events import RuntimeEvent
from .dependencies import run_dependencies_manager
from .repository import RunRepository
from .schemas import PendingReview, RunRequest, RunContext


async def create_approval_interrupt(
    session: AsyncSession | None,
    timeline_recorder: TimelineRecorder,
    *,
    run_id: str,
    thread_id: str,
    request: RunRequest,
    run_context: RunContext | None,
    sequence: int,
    kind: str,
    tool_name: str,
    arguments: dict[str, Any],
    extra_payload: dict[str, Any] | None = None,
    mcp_snapshot: McpToolSnapshot | None = None,
    custom_request_id: str | None = None,
    custom_tool_call_id: str | None = None,
) -> tuple[RuntimeEvent, RuntimeEvent, int]:
    """创建审批中断。
    
    统一处理：
    1. 持久化模式下向数据库插入 Interrupt 实体并置 Run 为 INTERRUPTED
    2. 注册 PendingReview 到运行时内存协调器
    3. 生成并记录 tool.call 与 tool.approval_required 两个时间线事件
    
    返回: (tool_call_event, approval_event, next_sequence)
    """
    request_id = custom_request_id or str(uuid4())
    tool_call_id = custom_tool_call_id or request_id

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

    # 2. 组装并暂存内存审查上下文 (PendingReview)
    pending_review = PendingReview(
        run_id,
        request,
        run_context,
        persisted=session is not None,
        mcp_snapshot=mcp_snapshot,
        arguments=arguments,
        tool_call_id=tool_call_id,
    )
    run_dependencies_manager.get_run_dependencies().run_coordination.register_pending_review(request_id, pending_review)

    # 3. 产生并投影两个关联事件
    sequence += 1
    tool_call_event = timeline_recorder.record(
        run_id,
        thread_id,
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
        thread_id,
        sequence,
        "tool.approval_required",
        tool=tool_name,
        tool_call_id=tool_call_id,
        request_id=request_id,
    )

    # 确保时间线快照及时固化
    await timeline_recorder.flush()

    return tool_call_event, approval_event, sequence
