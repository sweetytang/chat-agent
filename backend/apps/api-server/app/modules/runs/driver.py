"""运行驱动与流式执行的核心逻辑。"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Any
from uuid import UUID, uuid4

import anyio
from langchain_core.messages import BaseMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.db.models import RunStatus, Thread
from app.modules.mcp.agent import McpToolSnapshot, build_langchain_tools
from app.modules.runs.interrupts import create_approval_interrupt
from app.modules.threads.repository import ThreadRepository
from app.modules.threads.title import set_title_after_first_round
from app.modules.timeline.domain import extract_conversation_messages
from app.modules.timeline.recorder import TimelineRecorder

from .dependencies import run_dependencies_manager
from .finalization import finalize_incomplete_stream
from .repository import RunRepository
from .schemas import RunContext, RunRequest


async def invoke_agent_driver(
    *,
    session: AsyncSession | None,
    run_id: str,
    request: RunRequest,
    run_context: RunContext | None,
    timeline_recorder: TimelineRecorder,
    sequence: int,
    input_messages: Sequence[BaseMessage | dict[str, Any]],
    mcp_snapshots: tuple[McpToolSnapshot, ...] = (),
    prompt_content: str = "",
    default_assistant_content: str = "收到你的消息。",
    fake_model_chunks: tuple[str, ...] | None = None,
) -> AsyncIterator[str]:
    """统一的 AgentDriver 执行循环。

    处理图流式事件驱动、敏感工具二次/递归审批中断、增量记录、数据库收敛与 run.completed 闭环。
    """
    run_dependencies = run_dependencies_manager.get_run_dependencies()
    provider = run_dependencies.get_provider_config()
    model = (
        (
            run_dependencies.fake_chat_model(chunks=fake_model_chunks)
            if fake_model_chunks is not None
            else run_dependencies.fake_chat_model()
        )
        if provider.provider == "fake"
        else run_dependencies.create_chat_model(provider)
    )

    chunks: list[str] = []
    mcp_tools = tuple(build_langchain_tools(mcp_snapshots))
    snapshots_by_name = {snapshot.identity.internal_name: snapshot for snapshot in mcp_snapshots}

    # 读取当前会话已授权免审批的工具
    thread_approved_tools: set[str] = set()
    if session is not None:
        thread_id = to_uuid(request.thread_id)
        if thread_id is not None:
            thread_approved_tools = await ThreadRepository(session).get_approved_tools(thread_id)

    # 只有 require_approval 为 True 且未在当前对话中永久批准的工具才加入审批名单
    approval_tool_names = frozenset(
        name
        for name, snapshot in snapshots_by_name.items()
        if getattr(snapshot, "require_approval", True) and name not in thread_approved_tools
    )

    async for graph_event in run_dependencies.agent_driver().stream(
        model,
        input_messages,
        run_id=run_id,
        thread_id=request.thread_id,
        tools=[*run_dependencies.default_langchain_tools(), *mcp_tools],
        continue_after_tools=True,
        approval_tool_names=approval_tool_names,
    ):
        match graph_event.event:
            case "tool.approval_requested":
                # 调用工具审批中断
                tool_name = str(graph_event.data.get("tool", ""))
                snapshot = snapshots_by_name.get(tool_name)
                if snapshot is None:
                    continue

                arguments = graph_event.data.get("arguments")
                if not isinstance(arguments, dict):
                    arguments = {}

                tool_call_id = str(graph_event.data.get("tool_call_id") or uuid4())
                tool_call_event, approval_event, sequence = await create_approval_interrupt(
                    session,
                    timeline_recorder,
                    run_id=run_id,
                    request=request,
                    run_context=run_context,
                    sequence=sequence,
                    kind="mcp_tool",
                    tool_name=tool_name,
                    arguments=arguments,
                    extra_payload={
                        "remote_name": snapshot.identity.remote_name,
                        "server_id": snapshot.identity.server_id,
                        "security_version": snapshot.security_version,
                    },
                    tool_call_id=tool_call_id,
                )

                # MCP SDK 的 AnyIO 上下文无法跨会话，而审核会切换到另一个请求任务，因此这里先释放连接，恢复时再懒加载。
                mcp_host = run_dependencies.get_mcp_host()
                if mcp_host is not None:
                    await mcp_host.disconnect(snapshot.identity.server_id)
                yield tool_call_event.to_sse()
                yield approval_event.to_sse()
                return

            case "message.delta":
                # 普通增量消息
                chunks.append(str(graph_event.data.get("content", "")))

        sequence += 1
        projected_event = timeline_recorder.record(
            run_id, request.thread_id, sequence, graph_event.event, **graph_event.data
        )
        await timeline_recorder.flush_if_due()
        yield projected_event.to_sse()

    assistant_content = "".join(chunks) or default_assistant_content

    run_repository = RunRepository(session) if session is not None else None
    if run_repository is not None and run_context is not None:
        thread = await session.get(Thread, UUID(request.thread_id))
        if thread is not None:
            # run 可能等待过线程锁；写标题前同步其他 run 已提交的最新值。
            await session.refresh(thread, attribute_names=["title"])
            await set_title_after_first_round(
                thread,
                extract_conversation_messages(timeline_recorder.snapshot),
                mode=request.mode,
                user_content=prompt_content,
                assistant_content=assistant_content,
            )
        await run_repository.update_status(UUID(run_id), RunStatus.COMPLETED)

    # 先落库 commit，后发送 completed 事件
    sequence += 1
    completed_event = timeline_recorder.record(run_id, request.thread_id, sequence, "run.completed")
    await timeline_recorder.flush()
    yield completed_event.to_sse()


async def managed_run_stream(
    events: AsyncIterator[str],
    *,
    run_id: str,
    request: RunRequest,
    session: AsyncSession | None,
    run_context: RunContext | None,
    interrupted_is_terminal: bool = True,
) -> AsyncIterator[str]:
    try:
        run_dependencies = run_dependencies_manager.get_run_dependencies()
        run_coordination = run_dependencies.run_coordination
        async for event in events:
            yield event
    finally:
        # 使用 shield=True 保护终止状态写入数据库，不被客户端断开的 cancel 信号打断
        with anyio.CancelScope(shield=True):
            try:
                await finalize_incomplete_stream(
                    run_id,
                    request,
                    session=session,
                    current_checkpoint=run_context.checkpoint,
                    cancel_requested=run_coordination.is_cancel_requested(run_id),
                    interrupted_is_terminal=interrupted_is_terminal,
                )
            finally:
                run_coordination.remove_cancel_event(run_id)
