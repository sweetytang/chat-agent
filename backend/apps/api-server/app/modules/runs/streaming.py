from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
import re
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MessageRole, RunStatus, Thread
from app.modules.checkpoints.service import (
    RunBranchContext,
    append_message_checkpoint,
    latest_user_content,
    model_messages,
)
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot, build_langchain_tools
from app.modules.runs.repository import RunRepository
from app.modules.runs.schemas import PendingReview, RunRequest
from app.modules.threads.title import set_title_after_first_round


def _runtime() -> Any:
    from app.api import runs

    return runs


async def run_events(
    run_id: str,
    request: RunRequest,
    session: AsyncSession | None = None,
    branch_context: RunBranchContext | None = None,
    mcp_snapshots: tuple[McpToolSnapshot, ...] = (),
    mcp_load_error: str | None = None,
    mcp_loader: Callable[[], Awaitable[tuple[McpToolSnapshot, ...]]] | None = None,
) -> AsyncIterator[str]:
    """先提供稳定的业务事件协议，再把模型节点接入同一事件出口。"""

    cancel_event = _runtime()._cancel_events[run_id]
    lock = _runtime()._thread_lock(request.thread_id)
    sequence = 0
    yield _runtime()._event(run_id, request.thread_id, sequence, "run.queued").to_sse()
    async with lock:
        if cancel_event.is_set():
            yield (
                _runtime()._event(run_id, request.thread_id, sequence + 1, "run.cancelled").to_sse()
            )
            return

        sequence += 1
        yield _runtime()._event(run_id, request.thread_id, sequence, "run.started").to_sse()
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
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "mcp.error",
                    error=mcp_load_error,
                )
                .to_sse()
            )
        repository = RunRepository(session) if session is not None else None
        if repository is not None:
            assert session is not None
            await repository.update_status(UUID(run_id), RunStatus.RUNNING)
            await session.commit()
        if branch_context is not None and branch_context.created_checkpoint is not None:
            input_checkpoint = branch_context.created_checkpoint
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "checkpoint.created",
                    checkpoint_id=str(input_checkpoint.id),
                    parent_id=str(input_checkpoint.parent_id)
                    if input_checkpoint.parent_id
                    else None,
                )
                .to_sse()
            )
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "thread.updated",
                    current_checkpoint_id=str(input_checkpoint.id),
                )
                .to_sse()
            )

        snapshots = (
            branch_context.messages
            if branch_context is not None
            else ({"role": MessageRole.USER.value, "content": {"content": request.content}},)
        )
        input_messages = model_messages(snapshots)
        prompt_content = latest_user_content(snapshots, request.content)
        if prompt_content.startswith(("think:", "思考：")):
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "reasoning.delta",
                    content="正在分析请求并选择合适的执行路径。",
                )
                .to_sse()
            )

        # 这是模型没有产生文本时的安全兜底，不能把用户输入伪装成 assistant 回复。
        reply = "收到你的消息。"
        calculator_match = re.fullmatch(
            r"(?:calc|计算)(?::|：)?\s*(.+)", prompt_content, re.IGNORECASE
        )
        if calculator_match:
            expression = calculator_match.group(1)
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "tool.call",
                    tool="calculator",
                    arguments={"expression": expression},
                )
                .to_sse()
            )
            try:
                result = _runtime().calculate(expression)
                reply = f"计算结果：{result:g}"
                tool_data = {"tool": "calculator", "content": {"result": result}}
            except (SyntaxError, ValueError, ZeroDivisionError) as error:
                reply = f"计算失败：{error}"
                tool_data = {"tool": "calculator", "content": {"error": str(error)}}
            sequence += 1
            yield (
                _runtime()
                ._event(run_id, request.thread_id, sequence, "tool.result", **tool_data)
                .to_sse()
            )

        if prompt_content.startswith("json:"):
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "structured_output.delta",
                    value={"type": "text", "value": prompt_content.removeprefix("json:").strip()},
                )
                .to_sse()
            )
        if prompt_content.startswith("ui:"):
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "generative_ui.delta",
                    component="NoticeCard",
                    props={"text": prompt_content.removeprefix("ui:").strip()},
                )
                .to_sse()
            )

        if prompt_content.startswith(("search:", "搜索：")):
            request_id = str(uuid4())
            if repository is not None:
                assert session is not None
                await InterruptRepository(session).create(
                    UUID(run_id),
                    request_id,
                    "tool",
                    {
                        "tool": "web_search",
                        "query": prompt_content.split(":", 1)[-1].strip(),
                    },
                    branch_context.checkpoint_id if branch_context else None,
                )
                await repository.update_status(UUID(run_id), RunStatus.INTERRUPTED)
                await session.commit()
            _runtime()._pending_reviews[request_id] = PendingReview(
                run_id,
                request,
                branch_context,
                persisted=repository is not None,
            )
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "tool.call",
                    tool="web_search",
                    request_id=request_id,
                    arguments={"query": prompt_content.split(":", 1)[-1].strip()},
                )
                .to_sse()
            )
            sequence += 1
            yield (
                _runtime()
                ._event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "tool.approval_required",
                    tool="web_search",
                    request_id=request_id,
                )
                .to_sse()
            )
            return

        assistant_content = reply
        use_graph = calculator_match is None and not prompt_content.startswith(("json:", "ui:"))
        if use_graph:
            provider = _runtime().get_provider_config()
            model = (
                _runtime().FakeChatModel()
                if provider.provider == "fake"
                else _runtime().create_chat_model(provider)
            )
            chunks: list[str] = []
            mcp_tools = tuple(build_langchain_tools(mcp_snapshots))
            snapshots_by_name = {
                snapshot.identity.internal_name: snapshot for snapshot in mcp_snapshots
            }
            async for graph_event in _runtime().stream_graph_events(
                model,
                input_messages,
                run_id=run_id,
                thread_id=request.thread_id,
                tools=[*_runtime().default_langchain_tools(), *mcp_tools],
                continue_after_tools=True,
                approval_tool_names=frozenset(snapshots_by_name),
            ):
                if graph_event.event == "tool.approval_requested":
                    tool_name = str(graph_event.data.get("tool", ""))
                    snapshot = snapshots_by_name.get(tool_name)
                    if snapshot is None:
                        continue
                    arguments = graph_event.data.get("arguments")
                    if not isinstance(arguments, dict):
                        arguments = {}
                    request_id = str(uuid4())
                    payload = {
                        "tool": tool_name,
                        "remote_name": snapshot.identity.remote_name,
                        "server_id": snapshot.identity.server_id,
                        "arguments": arguments,
                        "security_version": snapshot.security_version,
                    }
                    if repository is not None:
                        assert session is not None
                        await InterruptRepository(session).create(
                            UUID(run_id),
                            request_id,
                            "mcp_tool",
                            payload,
                            branch_context.checkpoint_id if branch_context else None,
                        )
                        await repository.update_status(UUID(run_id), RunStatus.INTERRUPTED)
                        await session.commit()
                    _runtime()._pending_reviews[request_id] = PendingReview(
                        run_id,
                        request,
                        branch_context,
                        persisted=repository is not None,
                        mcp_snapshot=snapshot,
                        arguments=arguments,
                    )
                    # MCP SDK 的 AnyIO 上下文必须在建立它的 SSE 任务中关闭，
                    # 审核会切换到另一个请求任务，因此这里先释放连接，恢复时再懒加载。
                    if _runtime()._mcp_host is not None:
                        await _runtime()._mcp_host.disconnect(snapshot.identity.server_id)
                    sequence += 1
                    yield (
                        _runtime()
                        ._event(
                            run_id,
                            request.thread_id,
                            sequence,
                            "tool.call",
                            tool=tool_name,
                            request_id=request_id,
                            arguments=arguments,
                        )
                        .to_sse()
                    )
                    sequence += 1
                    yield (
                        _runtime()
                        ._event(
                            run_id,
                            request.thread_id,
                            sequence,
                            "tool.approval_required",
                            tool=tool_name,
                            request_id=request_id,
                        )
                        .to_sse()
                    )
                    return
                if graph_event.event == "message.delta":
                    chunks.append(str(graph_event.data.get("content", "")))
                sequence += 1
                yield (
                    _runtime()
                    ._event(
                        run_id, request.thread_id, sequence, graph_event.event, **graph_event.data
                    )
                    .to_sse()
                )
            assistant_content = "".join(chunks) or reply
        else:
            sequence += 1
            yield (
                _runtime()
                ._event(run_id, request.thread_id, sequence, "message.started", role="assistant")
                .to_sse()
            )
            if cancel_event.is_set():
                sequence += 1
                yield (
                    _runtime()._event(run_id, request.thread_id, sequence, "run.cancelled").to_sse()
                )
                return
            sequence += 1
            yield (
                _runtime()
                ._event(run_id, request.thread_id, sequence, "message.delta", content=reply)
                .to_sse()
            )
            sequence += 1
            yield (
                _runtime()._event(run_id, request.thread_id, sequence, "message.completed").to_sse()
            )
        if repository is not None and branch_context is not None:
            assert session is not None
            thread = await session.get(Thread, UUID(request.thread_id))
            if thread is not None:
                result = await append_message_checkpoint(
                    session,
                    thread,
                    parent_id=branch_context.checkpoint_id,
                    base_messages=branch_context.messages,
                    role=MessageRole.ASSISTANT,
                    content={"content": assistant_content},
                    run_id=UUID(run_id),
                    branch_name="重新生成" if request.mode == "regenerate" else None,
                )
                # run 可能等待过线程锁；写标题前同步其他 run 已提交的最新值。
                await session.refresh(thread, attribute_names=["title"])
                await set_title_after_first_round(
                    thread,
                    result.messages,
                    mode=request.mode,
                    user_content=prompt_content,
                    assistant_content=assistant_content,
                )
                sequence += 1
                yield (
                    _runtime()
                    ._event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "checkpoint.created",
                        checkpoint_id=str(result.checkpoint.id),
                        parent_id=str(result.checkpoint.parent_id),
                    )
                    .to_sse()
                )
                sequence += 1
                yield (
                    _runtime()
                    ._event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "thread.updated",
                        current_checkpoint_id=str(result.checkpoint.id),
                    )
                    .to_sse()
                )
            await repository.update_status(UUID(run_id), RunStatus.COMPLETED)
            await session.commit()
        sequence += 1
        yield _runtime()._event(run_id, request.thread_id, sequence, "run.completed").to_sse()
    _runtime()._cancel_events.pop(run_id, None)
