from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from uuid import UUID, uuid4

import anyio
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RunStatus, Thread
from app.modules.mcp.agent import McpToolSnapshot, build_langchain_tools
from app.modules.runs.interrupts import create_approval_interrupt
from app.modules.threads.title import set_title_after_first_round
from app.modules.timeline.domain import extract_conversation_messages, get_latest_user_content
from app.modules.timeline.recorder import TimelineRecorder

from .dependencies import run_dependencies_manager
from .finalization import finalize_incomplete_stream
from .repository import RunRepository
from .schemas import RunContext, RunRequest


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
        run_dependencies = run_dependencies_manager.configure_run_dependencies()
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
                    session,
                    run_context,
                    cancel_requested=run_coordination.is_cancel_requested(run_id),
                    interrupted_is_terminal=interrupted_is_terminal,
                )
            finally:
                run_coordination.remove_cancel_event(run_id)


async def generate_run_events(
    session: AsyncSession | None,
    run_id: str,
    request: RunRequest,
    run_context: RunContext | None,
    mcp_snapshots: tuple[McpToolSnapshot, ...] = (),
    mcp_load_error: str | None = None,
    mcp_loader: Callable[[], Awaitable[tuple[McpToolSnapshot, ...]]] | None = None,
) -> AsyncIterator[str]:
    """先提供稳定的业务事件协议，再把模型节点接入同一事件出口。"""

    run_dependencies = run_dependencies_manager.configure_run_dependencies()
    run_coordination = run_dependencies.run_coordination
    timeline_recorder = TimelineRecorder(
        checkpoint=run_context.checkpoint if run_context is not None else None,
        session=session,
    )
    sequence = 0
    yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.queued").to_sse()

    async with run_coordination.setdefault_chat_lock(request.thread_id):
        sequence += 1
        if run_coordination.is_cancel_requested(run_id):
            yield timeline_recorder.record(
                run_id, request.thread_id, sequence, "run.cancelled"
            ).to_sse()
            return

        yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.started").to_sse()
        if mcp_loader is not None:
            try:
                mcp_snapshots = await mcp_loader()
            except ValueError, OSError, RuntimeError:
                if session is not None:
                    await session.rollback()
                mcp_load_error = "MCP 工具加载失败，请检查 Server 状态并刷新"
        if mcp_load_error:
            sequence += 1
            yield (
                timeline_recorder.record(
                    run_id,
                    request.thread_id,
                    sequence,
                    "mcp.error",
                    item_id=f"{run_id}:mcp-error:{sequence}",
                    error=mcp_load_error,
                ).to_sse()
            )
        run_repository = RunRepository(session) if session is not None else None
        if run_repository is not None:
            await run_repository.update_status(UUID(run_id), RunStatus.RUNNING)
            await session.commit()

        timeline = run_context.timeline if run_context is not None else timeline_recorder.snapshot
        if run_context is None:  # 匿名 Demo 模式
            timeline["items"].append(  # 手动在内存时间线里，伪造追加一条用户发送的消息！
                {
                    "id": f"{run_id}:user",
                    "kind": "message",
                    "run_id": run_id,
                    "sequence": -1,
                    "logical_message_id": f"{run_id}:user",
                    "role": "user",
                    "content": request.content,
                    "status": "completed",
                    "terminal_segment": True,
                }
            )
        input_messages = extract_conversation_messages(timeline)
        prompt_content = get_latest_user_content(timeline, request.content)

        # # 1. 模拟思考前缀（若有）

        # async for sse, sequence in handle_reasoning_shortcut(
        #     timeline_recorder,
        #     run_id=run_id,
        #     thread_id=request.thread_id,
        #     prompt_content=prompt_content,
        #     sequence=sequence,
        # ):
        #     yield sse

        # # 2. 搜索审批中断前缀（若命中，直接推送中断事件并 return 挂起）

        # search_interrupt = await handle_search_interrupt_shortcut(
        #     session,
        #     timeline_recorder,
        #     run_id=run_id,
        #     thread_id=request.thread_id,
        #     request=request,
        #     run_context=run_context,
        #     prompt_content=prompt_content,
        #     sequence=sequence,
        # )
        # if search_interrupt is not None:
        #     tool_call_event, approval_event, sequence = search_interrupt
        #     yield tool_call_event.to_sse()
        #     yield approval_event.to_sse()
        #     return  # 触发中断，提前结束流

        # # 3. 如果命中计算器/卡片等快捷规则，执行规则流

        assistant_content = "收到你的消息。"
        # if is_shortcut_rule(prompt_content):
        #     async for sse, sequence, assistant_content in execute_shortcut_rule(
        #         timeline_recorder,
        #         run_dependencies,
        #         run_id=run_id,
        #         thread_id=request.thread_id,
        #         prompt_content=prompt_content,
        #         sequence=sequence,
        #     ):
        #         yield sse
        #     # 快捷规则完成后，补齐标准的 assistant 消息闭环
        #     message_id = f"{run_id}:assistant"
        #     item_id = f"{message_id}:segment:0"
        #     sequence += 1
        #     yield timeline_recorder.record(run_id, request.thread_id, sequence, "message.started", role="assistant", item_id=item_id, message_id=message_id).to_sse()
        #     if run_coordination.is_cancel_requested(run_id):
        #         sequence += 1
        #         yield timeline_recorder.record(run_id, request.thread_id, sequence, "run.cancelled").to_sse()
        #         return
        #     sequence += 1
        #     yield timeline_recorder.record(run_id, request.thread_id, sequence, "message.delta", item_id=item_id, content=assistant_content).to_sse()
        #     sequence += 1
        #     yield timeline_recorder.record(run_id, request.thread_id, sequence, "message.completed", item_id=item_id, message_id=message_id).to_sse()
        # else :
        # 4. 否则：进入真实大模型 LangGraph 图执行分支

        provider = run_dependencies.get_provider_config()
        model = (
            run_dependencies.fake_chat_model()
            if provider.provider == "fake"
            else run_dependencies.create_chat_model(provider)
        )
        chunks: list[str] = []
        mcp_tools = tuple(build_langchain_tools(mcp_snapshots))
        snapshots_by_name = {
            snapshot.identity.internal_name: snapshot for snapshot in mcp_snapshots
        }
        async for graph_event in run_dependencies.agent_driver().stream(
            model,
            input_messages,
            run_id=run_id,
            thread_id=request.thread_id,
            tools=[*run_dependencies.default_langchain_tools(), *mcp_tools],
            continue_after_tools=True,
            approval_tool_names=frozenset(snapshots_by_name),
        ):
            match graph_event.event:
                case "tool.approval_requested":
                    # 调用工具事件
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
                        mcp_snapshot=snapshot,
                        tool_call_id=tool_call_id,
                    )

                    # MCP SDK 的 AnyIO 上下文必须在建立它的 SSE 任务中关闭，
                    # 审核会切换到另一个请求任务，因此这里先释放连接，恢复时再懒加载。
                    mcp_host_getter = run_dependencies.mcp_host
                    mcp_host = mcp_host_getter() if callable(mcp_host_getter) else mcp_host_getter
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
        assistant_content = "".join(chunks) or assistant_content

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

        # 先落库 commit，后发送completed事件
        sequence += 1
        completed_event = timeline_recorder.record(
            run_id, request.thread_id, sequence, "run.completed"
        )
        await timeline_recorder.flush()
        yield completed_event.to_sse()
