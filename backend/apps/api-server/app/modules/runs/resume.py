from __future__ import annotations

from collections.abc import AsyncIterator
import json
from uuid import UUID

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import InterruptStatus, Run, RunStatus
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent.results import normalize_tool_result
from app.modules.mcp.host import McpHostError
from app.modules.timeline.domain import extract_conversation_messages, get_latest_user_content
from app.modules.timeline.recorder import TimelineRecorder

from .driver import invoke_agent_driver
from .repository import RunRepository
from .schemas import PendingReview, ResumeRequest


async def generate_resumed_run_events(
    resume_request: ResumeRequest,
    pendind_review: PendingReview,
    *,
    session: AsyncSession | None = None,
) -> AsyncIterator[str]:
    if pendind_review is None:
        raise ValueError("generate_resumed_run_events: pending_review can not be empty")
    run_id = pendind_review.run_id
    request = pendind_review.request
    run_context = pendind_review.run_context
    tool_call_id = pendind_review.tool_call_id
    request_id = resume_request.request_id
    decision = resume_request.decision
    edited_payload = resume_request.payload

    checkpoint = run_context.checkpoint if run_context is not None else None
    # 演示线程可以在有 PostgreSQL 会话时运行，但它没有对应的数据库 run。
    # 只有确认记录存在，恢复流程才进入持久化分支。
    persisted_session = None
    if session is not None:
        try:
            persisted_session = (
                session if await session.get(Run, UUID(run_id)) is not None else None
            )
        except ValueError, OSError, RuntimeError:
            await session.rollback()

    timeline_recorder = TimelineRecorder(
        checkpoint=checkpoint,
        session=session,
    )
    tool_call_id = (
        pendind_review.tool_call_id
        if pendind_review and pendind_review.tool_call_id
        else request_id
    )

    repository = RunRepository(persisted_session) if persisted_session is not None else None
    if repository is not None:
        await InterruptRepository(persisted_session).update_status(
            request_id, InterruptStatus.RESUMED
        )
        await repository.update_status(UUID(run_id), RunStatus.RESUMING)
        await persisted_session.commit()
    sequence = timeline_recorder.next_sequence
    yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.resuming").to_sse()

    snapshot = pendind_review.mcp_snapshot
    arguments = pendind_review.arguments or {}
    tool_name = snapshot.identity.internal_name
    if decision == "reject":
        result = {"error": f"用户拒绝执行 MCP({snapshot.identity.remote_name}) 工具"}
    else:
        if decision == "edit" and edited_payload is not None:
            candidate = edited_payload.get("arguments", edited_payload)
            if isinstance(candidate, dict):
                arguments = candidate
        try:
            # 无论是成功结果还是 error 结果，都正常记录 tool.result 并推给前端！
            result = normalize_tool_result(await snapshot.caller(snapshot.identity, arguments))
        except (McpHostError, Exception) as cause:
            result = {
                "error": f"An error occurred when calling the tool, as shown below:：\n{cause!r}"
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

    # 1. 组装输入消息（对齐上下文协议）
    conversation_history = extract_conversation_messages(timeline_recorder.snapshot)
    input_messages: list[HumanMessage | AIMessage | SystemMessage | ToolMessage] = []
    for msg in conversation_history:
        content = msg.get("content", "")
        match msg.get("role"):
            case "user":
                input_messages.append(HumanMessage(content=content))
            case "assistant":
                input_messages.append(AIMessage(content=content))
            case "system":
                input_messages.append(SystemMessage(content=content))

    # 拼入被恢复工具的调用和执行结果
    input_messages.extend(
        [
            AIMessage(
                content="",
                tool_calls=[{"name": tool_name, "args": arguments, "id": tool_call_id}],
            ),
            ToolMessage(
                content=(
                    json.dumps(result, ensure_ascii=False)
                    if isinstance(result, (dict, list))
                    else str(result)
                ),
                tool_call_id=tool_call_id,
            ),
        ]
    )

    # 2. 统一调用抽取出来的 invoke_agent_driver
    mcp_snapshots = (snapshot,) if snapshot is not None else ()
    prompt_content = get_latest_user_content(timeline_recorder.snapshot, request.content)
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
        prompt_content=prompt_content,
        default_assistant_content=assistant_content,
        fake_model_chunks=("收到工具结果：",),
    ):
        yield event
