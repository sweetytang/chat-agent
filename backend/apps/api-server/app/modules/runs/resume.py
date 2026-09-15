from __future__ import annotations

from collections.abc import AsyncIterator
import json
from uuid import UUID, uuid4

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint, InterruptStatus, Run, RunStatus, Thread
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import build_langchain_tools
from app.modules.mcp.agent.results import normalize_tool_result
from app.modules.mcp.host import McpHostError
from app.modules.runs.interrupts import create_approval_interrupt
from app.modules.threads.title import set_title_after_first_round
from app.modules.timeline.domain import extract_conversation_messages, get_latest_user_content
from app.modules.timeline.recorder import TimelineRecorder

from .dependencies import run_dependencies_manager
from .finalization import mark_run_failure
from .repository import RunRepository
from .schemas import PendingReview, ResumeRequest, RunContext


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
            # 上一轮的model实例都是游离态，想要更改同步数据库，必须Re-attach（checkpoint）；只读则不用重新获取（input_checkpoint）
            if persisted_session is not None and checkpoint is not None:
                db_checkpoint = await session.get(Checkpoint, checkpoint.id)
                if db_checkpoint is not None:
                    checkpoint = db_checkpoint
                    if run_context is not None:
                        run_context = RunContext(
                            checkpoint=checkpoint,
                            input_checkpoint=run_context.input_checkpoint,
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
    if snapshot is not None:
        if decision == "reject":
            result: object = {"error": "用户拒绝执行 MCP 工具"}
        else:
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
                sequence += 1
                yield (
                    timeline_recorder.record(
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
                    timeline_recorder.record(
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
                    await timeline_recorder.flush()
                return
            except Exception:
                # 非 Host 异常仍使用通用文案，避免意外泄露内部信息。
                error = "MCP 工具调用失败，请检查 Server 状态、地址和凭据"
                sequence += 1
                yield (
                    timeline_recorder.record(
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
                    timeline_recorder.record(
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
                    await timeline_recorder.flush()
                return
        tool_name = snapshot.identity.internal_name
    else:
        result = {"query": request.content.split(":", 1)[-1].strip(), "results": []}
        if decision == "reject":
            result = {"error": "用户拒绝执行搜索"}
        tool_name = "web_search"
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
    # 从当前完整的时间线快照中提取出历史所有的对话消息
    conversation_history = extract_conversation_messages(timeline_recorder.snapshot)
    input_messages: list[HumanMessage | AIMessage | SystemMessage | ToolMessage] = []
    for msg in conversation_history:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            input_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            input_messages.append(AIMessage(content=content))
        elif role == "system":
            input_messages.append(SystemMessage(content=content))

    # 拼入被恢复工具的调用和执行结果
    input_messages.append(
        AIMessage(
            content="",
            tool_calls=[{"name": tool_name, "args": arguments, "id": tool_call_id}],
        )
    )
    input_messages.append(
        ToolMessage(
            content=(
                json.dumps(result, ensure_ascii=False)
                if isinstance(result, (dict, list))
                else str(result)
            ),
            tool_call_id=tool_call_id,
        )
    )

    # 2. 调用驱动替换为 agent_driver().stream（对齐执行引擎）
    run_dependencies = run_dependencies_manager.get_run_dependencies()
    provider = run_dependencies.get_provider_config()
    model = (
        run_dependencies.fake_chat_model(chunks=("收到工具结果：",))
        if provider.provider == "fake"
        else run_dependencies.create_chat_model(provider)
    )

    mcp_snapshots = (snapshot,) if snapshot is not None else ()
    mcp_tools = tuple(build_langchain_tools(mcp_snapshots))
    snapshots_by_name = {item.identity.internal_name: item for item in mcp_snapshots}

    chunks: list[str] = []
    assistant_content = "工具执行完成。" if decision != "reject" else "已按要求拒绝工具执行。"

    async for graph_event in run_dependencies.agent_driver().stream(
        model,
        input_messages,
        run_id=run_id,
        thread_id=request.thread_id,
        tools=[*run_dependencies.default_langchain_tools(), *mcp_tools],
        continue_after_tools=True,
        approval_tool_names=frozenset(snapshots_by_name),
    ):
        # 连续审批递归处理（如遇第二个敏感工具）
        if graph_event.event == "tool.approval_requested":
            next_tool_name = str(graph_event.data.get("tool", ""))
            next_snapshot = snapshots_by_name.get(next_tool_name)
            if next_snapshot is None:
                continue
            next_arguments = graph_event.data.get("arguments")
            if not isinstance(next_arguments, dict):
                next_arguments = {}

            next_tool_call_id = str(graph_event.data.get("tool_call_id") or uuid4())
            tool_call_event, approval_event, sequence = await create_approval_interrupt(
                session,
                timeline_recorder,
                run_id=run_id,
                request=request,
                run_context=run_context,
                sequence=sequence,
                kind="mcp_tool",
                tool_name=next_tool_name,
                arguments=next_arguments,
                extra_payload={
                    "remote_name": next_snapshot.identity.remote_name,
                    "server_id": next_snapshot.identity.server_id,
                    "security_version": next_snapshot.security_version,
                },
                mcp_snapshot=next_snapshot,
                tool_call_id=next_tool_call_id,
            )

            mcp_host_getter = run_dependencies.mcp_host
            mcp_host = mcp_host_getter() if callable(mcp_host_getter) else mcp_host_getter
            if mcp_host is not None:
                await mcp_host.disconnect(next_snapshot.identity.server_id)
            yield tool_call_event.to_sse()
            yield approval_event.to_sse()
            return

        if graph_event.event == "message.delta":
            chunks.append(str(graph_event.data.get("content", "")))

        # 3. 事件消费对齐（对齐前端协议，sequence 严格单调自增）
        sequence += 1
        projected_event = timeline_recorder.record(
            run_id, request.thread_id, sequence, graph_event.event, **graph_event.data
        )
        await timeline_recorder.flush_if_due()
        yield projected_event.to_sse()

    assistant_content = "".join(chunks) or assistant_content

    if repository is not None and run_context is not None:
        assert persisted_session is not None
        thread = await persisted_session.get(Thread, UUID(request.thread_id))
        if thread is not None:
            # HITL 恢复也可能是首轮完成，沿用普通完成路径的最新值检查。
            await persisted_session.refresh(thread, attribute_names=["title"])
            await set_title_after_first_round(
                thread,
                extract_conversation_messages(timeline_recorder.snapshot),
                mode=request.mode,
                user_content=get_latest_user_content(timeline_recorder.snapshot, request.content),
                assistant_content=assistant_content,
            )
        await repository.update_status(UUID(run_id), RunStatus.COMPLETED)

    sequence += 1
    completed_event = timeline_recorder.record(run_id, request.thread_id, sequence, "run.completed")
    await timeline_recorder.flush()
    yield completed_event.to_sse()


async def safe_generate_resumed_run_events(
    resume_request: ResumeRequest,
    pendind_review: PendingReview,
    *,
    session: AsyncSession | None = None,
) -> AsyncIterator[str]:
    """恢复流的最后一道边界，避免未捕获异常直接表现为浏览器 network error。"""

    run_id = pendind_review.run_id
    request = pendind_review.request
    thread_id = getattr(request, "thread_id", "")
    run_context = pendind_review.run_context

    try:
        async for event in generate_resumed_run_events(
            resume_request,
            pendind_review,
            session=session,
        ):
            yield event
    except McpHostError as error:
        yield (await mark_run_failure(run_id, thread_id, str(error), session, run_context)).to_sse()
    except Exception as error:
        yield (
            await mark_run_failure(
                run_id,
                thread_id,
                f"MCP 恢复失败（{type(error).__name__}）",
                session,
                run_context,
            )
        ).to_sse()
