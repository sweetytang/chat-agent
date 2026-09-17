from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.db.models import InterruptStatus, RunStatus
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot
from app.modules.mcp.agent.domain import normalize_tool_result
from app.modules.mcp.agent.runtime import load_mcp_snapshots
from app.modules.mcp.host.client import McpHostError
from app.modules.threads.repository import ThreadRepository
from app.modules.timeline.domain import timeline_to_model_messages
from app.modules.timeline.recorder import TimelineRecorder

from .dependencies import run_dependencies_manager
from .driver import invoke_agent_driver
from .repository import RunRepository
from .schemas import ResumeRequest, RunContext, RunRequest


async def generate_resumed_run_events(
    run_id: str,
    resume_request: ResumeRequest,
    request: RunRequest,
    run_context: RunContext,
    tool_call_id: str,
    arguments: dict,
    *,
    user_id: UUID,
    session: AsyncSession,
    snapshot: McpToolSnapshot,
) -> AsyncIterator[str]:
    request_id = resume_request.request_id
    decision = resume_request.decision
    edited_payload = resume_request.payload

    checkpoint = run_context.checkpoint if run_context is not None else None

    timeline_recorder = TimelineRecorder(
        checkpoint=checkpoint,
        session=session,
    )
    await InterruptRepository(session).update_status(request_id, InterruptStatus.RESUMED)
    await RunRepository(session).update_status(UUID(run_id), RunStatus.RESUMING)
    await session.commit()

    sequence = timeline_recorder.next_sequence
    yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.resuming").to_sse()

    # 恢复审核工具的调用
    if snapshot is None:
        # 明确告知大模型：工具不可用，未执行任何操作！
        result = {"error": "执行失败：工具当前不可用或对应的 MCP 服务已离线，未能执行。"}
    else:
        tool_name = snapshot.identity.internal_name
        if decision == "reject":
            remote_name = snapshot.identity.remote_name if snapshot is not None else tool_name
            result = {"error": f"用户拒绝执行 MCP({remote_name}) 工具"}
        else:
            if decision == "approve_always":
                thread_id = to_uuid(request.thread_id)
                if thread_id is not None:
                    await ThreadRepository(session).add_approved_tool(thread_id, tool_name)
                    await session.commit()

            if decision == "edit" and edited_payload is not None:
                candidate = edited_payload.get("arguments", edited_payload)
                if isinstance(candidate, dict):
                    arguments = candidate
            if snapshot is not None:
                try:
                    # 无论是成功结果还是 error 结果，都正常记录 tool.result 并推给前端！
                    result = normalize_tool_result(
                        await snapshot.caller(snapshot.identity, arguments)
                    )
                except (McpHostError, Exception) as cause:
                    result = {
                        "error": f"An error occurred when calling the tool {tool_name}, as shown below:：\n{cause!r}"
                    }

    sequence += 1
    yield (
        timeline_recorder.record(
            run_id,
            request.thread_id,
            sequence,
            "tool.result",
            tool=tool_name,
            tool_call_id=tool_call_id,
            content=result,
        ).to_sse()
    )

    # 2. 恢复时大模型仍需具备调用其余 MCP 工具的能力（如 write_file），不能仅传入刚执行完的这单一快照
    mcp_snapshots: tuple = ()
    mcp_host = run_dependencies_manager.get_run_dependencies().get_mcp_host()
    if mcp_host is not None:
        try:
            mcp_snapshots = await load_mcp_snapshots(session, user_id, mcp_host)
        except Exception:
            # 重新拉取失败时，至少保留当前快照保底
            mcp_snapshots = (snapshot,) if snapshot is not None else ()
    input_messages = timeline_to_model_messages(timeline_recorder.snapshot)
    assistant_content = "工具执行完成。" if decision != "reject" else "已按要求拒绝工具执行。"

    async for event in invoke_agent_driver(
        session=session,
        run_id=run_id,
        request=request,
        run_context=run_context,
        timeline_recorder=timeline_recorder,
        sequence=sequence,
        input_messages=input_messages,
        mcp_snapshots=mcp_snapshots,
        prompt_content=request.content,
        default_assistant_content=assistant_content,
        fake_model_chunks=("收到工具结果：",),
    ):
        yield event
