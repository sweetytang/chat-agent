from __future__ import annotations

from collections.abc import AsyncIterator
import json
from uuid import UUID

from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import InterruptStatus, Run, RunStatus, Thread
from app.modules.checkpoints.service import (
    RunBranchContext,
    latest_user_content,
    model_messages,
)
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent.results import normalize_tool_result
from app.modules.mcp.host import McpHostError
from app.modules.runs.context import (
    RunDependencies,
    configure_run_dependencies,
    get_run_dependencies,
)
from app.modules.runs.repository import RunRepository
from app.modules.runs.schemas import PendingReview, RunRequest
from app.modules.threads.title import set_title_after_first_round
from app.modules.timeline.recorder import TimelineRecorder


def _runtime() -> RunDependencies:
    return get_run_dependencies()


def _chunk_text(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(
            _chunk_text(item.get("text", "") if isinstance(item, dict) else item) for item in value
        )
    return ""


async def resumed_run_events(
    run_id: str,
    request: RunRequest,
    request_id: str,
    decision: str,
    session: AsyncSession | None,
    branch_context: RunBranchContext | None,
    pending: PendingReview | None = None,
    edited_payload: dict[str, object] | None = None,
    dependencies: RunDependencies | None = None,
) -> AsyncIterator[str]:
    if dependencies is not None:
        configure_run_dependencies(dependencies)
    recorder = TimelineRecorder(
        event_factory=_runtime()._event,
        snapshot=branch_context.timeline if branch_context is not None else None,
        checkpoint=branch_context.checkpoint if branch_context is not None else None,
        session=session,
    )
    tool_call_id = pending.tool_call_id if pending and pending.tool_call_id else request_id
    sequence = 0
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
    repository = RunRepository(persisted_session) if persisted_session is not None else None
    if repository is not None:
        assert persisted_session is not None
        await InterruptRepository(persisted_session).update_status(
            request_id, InterruptStatus.RESUMED
        )
        await repository.update_status(UUID(run_id), RunStatus.RESUMING)
        await persisted_session.commit()
    yield recorder.event(run_id, request.thread_id, sequence, "run.resuming").to_sse()
    sequence += 1
    if pending is not None and pending.mcp_snapshot is not None:
        snapshot = pending.mcp_snapshot
        if decision == "reject":
            result: object = {"error": "用户拒绝执行 MCP 工具"}
        else:
            arguments = pending.arguments or {}
            if decision == "edit" and edited_payload is not None:
                candidate = edited_payload.get("arguments", edited_payload)
                if isinstance(candidate, dict):
                    arguments = candidate
            try:
                result = normalize_tool_result(await snapshot.caller(snapshot.identity, arguments))
            except McpHostError as cause:
                # MCP 调用发生在 StreamingResponse 已返回 200 之后。若异常直接冒泡，
                # 浏览器只能看到连接中断并显示 network error，丢失真正的失败原因。
                error = str(cause)
                yield (
                    recorder.event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "tool.result",
                        tool=snapshot.identity.internal_name,
                        tool_call_id=tool_call_id,
                        content={"error": error},
                    ).to_sse()
                )
                sequence += 1
                yield (
                    recorder.event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "run.failed",
                        item_id=f"{run_id}:error:{sequence}",
                        error=error,
                    ).to_sse()
                )
                if repository is not None:
                    assert persisted_session is not None
                    await repository.update_status(UUID(run_id), RunStatus.FAILED)
                    await recorder.flush()
                return
            except Exception:
                # 非 Host 异常仍使用通用文案，避免意外泄露内部信息。
                error = "MCP 工具调用失败，请检查 Server 状态、地址和凭据"
                yield (
                    recorder.event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "tool.result",
                        tool=snapshot.identity.internal_name,
                        tool_call_id=tool_call_id,
                        content={"error": error},
                    ).to_sse()
                )
                sequence += 1
                yield (
                    recorder.event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "run.failed",
                        item_id=f"{run_id}:error:{sequence}",
                        error=error,
                    ).to_sse()
                )
                if repository is not None:
                    assert persisted_session is not None
                    await repository.update_status(UUID(run_id), RunStatus.FAILED)
                    await recorder.flush()
                return
        tool_name = snapshot.identity.internal_name
    else:
        result = {"query": request.content.split(":", 1)[-1].strip(), "results": []}
        if decision == "reject":
            result = {"error": "用户拒绝执行搜索"}
        tool_name = "web_search"
    yield (
        recorder.event(
            run_id,
            request.thread_id,
            sequence,
            "tool.result",
            tool=tool_name,
            tool_call_id=tool_call_id,
            content=result,
        ).to_sse()
    )
    sequence += 1
    # 审核恢复必须把工具结果重新交给模型，而不是直接伪造“工具执行完成”。
    answer = "已按要求拒绝工具执行。" if decision == "reject" else "工具执行完成。"
    message_id = f"{run_id}:assistant"
    item_id = f"{message_id}:resume:{request_id}"
    yield recorder.event(
        run_id,
        request.thread_id,
        sequence,
        "message.started",
        role="assistant",
        item_id=item_id,
        message_id=message_id,
    ).to_sse()
    answer_parts: list[str] = []
    try:
        provider = _runtime().get_provider_config()
        model = (
            _runtime().FakeChatModel(chunks=("收到工具结果：",))
            if provider.provider == "fake"
            else _runtime().create_chat_model(provider)
        )
        model_messages_for_resume = [
            HumanMessage(content=request.content),
            HumanMessage(
                content=(
                    "以下是 MCP 工具返回结果，请基于用户问题给出最终答复：\n"
                    + json.dumps(result, ensure_ascii=False)
                )
            ),
        ]
        async for chunk in model.astream(model_messages_for_resume):
            content = _chunk_text(getattr(chunk, "content", ""))
            if not content:
                continue
            answer_parts.append(content)
            sequence += 1
            yield (
                recorder.event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "message.delta",
                    item_id=item_id,
                    content=content,
                ).to_sse()
            )
    except Exception:
        # 工具已成功执行时，即使二次模型调用失败，也返回可解释的降级答复。
        answer_parts = []
        answer = "工具已执行，但生成最终答复失败，请重试。"
    else:
        answer = "".join(answer_parts) or "工具已执行，但生成最终答复失败，请重试。"
    if not answer_parts:
        sequence += 1
        yield (
            recorder.event(
                run_id,
                request.thread_id,
                sequence,
                "message.delta",
                item_id=item_id,
                content=answer,
            ).to_sse()
        )
    sequence += 1
    yield recorder.event(
        run_id,
        request.thread_id,
        sequence,
        "message.completed",
        item_id=item_id,
        message_id=message_id,
    ).to_sse()
    if repository is not None and branch_context is not None:
        assert persisted_session is not None
        thread = await persisted_session.get(Thread, UUID(request.thread_id))
        if thread is not None:
            # HITL 恢复也可能是首轮完成，沿用普通完成路径的最新值检查。
            await persisted_session.refresh(thread, attribute_names=["title"])
            await set_title_after_first_round(
                thread,
                model_messages(recorder.snapshot),
                mode=request.mode,
                user_content=latest_user_content(recorder.snapshot, request.content),
                assistant_content=answer,
            )
            sequence += 1
            yield (
                recorder.event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "checkpoint.created",
                    checkpoint_id=str(branch_context.checkpoint_id),
                    parent_id=str(branch_context.checkpoint.parent_id)
                    if branch_context.checkpoint and branch_context.checkpoint.parent_id
                    else None,
                ).to_sse()
            )
            sequence += 1
            yield (
                recorder.event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "thread.updated",
                    current_checkpoint_id=str(branch_context.checkpoint_id),
                ).to_sse()
            )
        await repository.update_status(UUID(run_id), RunStatus.COMPLETED)
        await recorder.flush()
    sequence += 1
    yield recorder.event(run_id, request.thread_id, sequence, "run.completed").to_sse()
    await recorder.flush()
