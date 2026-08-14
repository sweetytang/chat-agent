from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
import json
import re
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.events import BusinessEvent
from app.core.config import get_settings
from app.core.security import get_optional_subject
from app.db.models import InterruptStatus, McpServerDefinition, MessageRole, Run, RunStatus, Thread
from app.db.session import get_optional_db_session
from app.graph.runtime import stream_graph_events
from app.integrations.llm.config import get_provider_config
from app.integrations.llm.factory import create_chat_model
from app.integrations.llm.fake import FakeChatModel
from app.integrations.tools.langchain import default_langchain_tools
from app.integrations.tools.registry import calculate
from app.modules.checkpoints.service import (
    RunBranchContext,
    append_message_checkpoint,
    checkpoint_messages,
    create_run_branch,
    latest_user_content,
    message_snapshot,
    model_messages,
)
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot, build_langchain_tools, load_mcp_snapshots
from app.modules.mcp.agent.results import normalize_tool_result
from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.host import McpHost, McpHostError
from app.modules.runs.repository import RunRepository
from app.modules.threads.repository import ThreadRepository
from app.modules.threads.title import (
    set_title_after_first_round,
)

router = APIRouter(prefix="/api/runs", tags=["runs"])

_thread_locks: dict[str, asyncio.Lock] = {}
_cancel_events: dict[str, asyncio.Event] = {}


class RunRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    checkpoint_id: UUID | None = None
    mode: str = Field(default="send", pattern="^(send|edit|regenerate)$")


class ResumeRequest(BaseModel):
    request_id: str = Field(min_length=1)
    decision: str = Field(pattern="^(approve|edit|reject)$")
    payload: dict[str, object] | None = None


@dataclass(frozen=True)
class PendingReview:
    run_id: str
    request: RunRequest
    branch_context: RunBranchContext | None
    persisted: bool = False
    mcp_snapshot: McpToolSnapshot | None = None
    arguments: dict[str, Any] | None = None


_pending_reviews: dict[str, PendingReview] = {}
_mcp_host: McpHost | None = None


def configure_mcp_host(host: McpHost | None) -> None:
    global _mcp_host
    _mcp_host = host


def _decode_mcp_credentials(encrypted: str | None) -> dict[str, str]:
    if encrypted is None:
        return {}
    key_text = get_settings().mcp_encryption_key
    if not key_text:
        raise ValueError("MCP 凭据加密未配置")
    value = json.loads(
        CredentialCrypto(base64.urlsafe_b64decode(key_text.encode())).decrypt(encrypted)
    )
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise ValueError("MCP 凭据不可用")
    return value


def _thread_lock(thread_id: str) -> asyncio.Lock:
    return _thread_locks.setdefault(thread_id, asyncio.Lock())


def _event(run_id: str, thread_id: str, sequence: int, name: str, **data: object) -> BusinessEvent:
    return BusinessEvent(1, name, run_id, thread_id, sequence, data)


def _required_user_id(subject: str | None) -> UUID:
    if subject is None:
        raise HTTPException(status_code=401, detail="需要登录后访问该资源")
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="无效用户身份") from error


def _require_thread_owner(thread: Thread, subject: str | None) -> None:
    if thread.user_id != _required_user_id(subject):
        raise HTTPException(status_code=404, detail="线程不存在")


async def _persisted_run(
    session: AsyncSession | None,
    run_id: str,
) -> Run | None:
    if session is None:
        return None
    try:
        parsed_run_id = UUID(run_id)
    except ValueError:
        return None
    return await session.get(Run, parsed_run_id)


async def _require_run_owner(
    session: AsyncSession,
    run: Run,
    subject: str | None,
) -> None:
    user_id = _required_user_id(subject)
    thread = await session.get(Thread, run.thread_id)
    if thread is None or thread.user_id != user_id:
        raise HTTPException(status_code=404, detail="运行不存在")


async def _load_branch_base(
    session: AsyncSession,
    thread: Thread,
    checkpoint_id: UUID | None,
    *,
    use_current_if_none: bool = True,
) -> tuple[UUID | None, tuple[dict, ...]]:
    repository = ThreadRepository(session)
    base_checkpoint_id = (
        thread.current_checkpoint_id
        if checkpoint_id is None and use_current_if_none
        else checkpoint_id
    )
    if base_checkpoint_id is None:
        return None, ()

    checkpoint = await repository.get_checkpoint(thread.id, base_checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="checkpoint 不存在")
    snapshots = checkpoint_messages(checkpoint)
    if snapshots is None:
        snapshots = tuple(
            message_snapshot(item) for item in await repository.list_messages(thread.id)
        )
    return base_checkpoint_id, snapshots


async def _prepare_persisted_run(
    session: AsyncSession,
    run_id: UUID,
    request: RunRequest,
    thread: Thread,
) -> RunBranchContext | None:
    base_checkpoint_id, base_messages = await _load_branch_base(
        session,
        thread,
        request.checkpoint_id,
        use_current_if_none="checkpoint_id" not in request.model_fields_set,
    )
    if request.mode == "regenerate" and (
        not base_messages or base_messages[-1].get("role") != MessageRole.USER.value
    ):
        raise HTTPException(status_code=400, detail="重新生成必须指定用户消息 checkpoint")
    await RunRepository(session).create(thread.id, run_id=run_id)
    branch_context = await create_run_branch(
        session,
        thread,
        run_id=run_id,
        mode=request.mode,
        content=request.content,
        base_checkpoint_id=base_checkpoint_id,
        base_messages=base_messages,
    )
    await session.commit()
    return branch_context


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

    cancel_event = _cancel_events[run_id]
    lock = _thread_lock(request.thread_id)
    sequence = 0
    yield _event(run_id, request.thread_id, sequence, "run.queued").to_sse()
    async with lock:
        if cancel_event.is_set():
            yield _event(run_id, request.thread_id, sequence + 1, "run.cancelled").to_sse()
            return

        sequence += 1
        yield _event(run_id, request.thread_id, sequence, "run.started").to_sse()
        if mcp_loader is not None:
            try:
                mcp_snapshots = await mcp_loader()
            except (ValueError, OSError, RuntimeError):
                if session is not None:
                    await session.rollback()
                mcp_load_error = "MCP 工具加载失败，请检查 Server 状态并刷新"
        if mcp_load_error:
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "mcp.error",
                error=mcp_load_error,
            ).to_sse()
        repository = RunRepository(session) if session is not None else None
        if repository is not None:
            await repository.update_status(UUID(run_id), RunStatus.RUNNING)
            await session.commit()
        if branch_context is not None and branch_context.created_checkpoint is not None:
            input_checkpoint = branch_context.created_checkpoint
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "checkpoint.created",
                checkpoint_id=str(input_checkpoint.id),
                parent_id=str(input_checkpoint.parent_id) if input_checkpoint.parent_id else None,
            ).to_sse()
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "thread.updated",
                current_checkpoint_id=str(input_checkpoint.id),
            ).to_sse()

        snapshots = (
            branch_context.messages
            if branch_context is not None
            else ({"role": MessageRole.USER.value, "content": {"content": request.content}},)
        )
        input_messages = model_messages(snapshots)
        prompt_content = latest_user_content(snapshots, request.content)
        if prompt_content.startswith(("think:", "思考：")):
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "reasoning.delta",
                content="正在分析请求并选择合适的执行路径。",
            ).to_sse()

        reply = f"收到：{prompt_content}"
        calculator_match = re.fullmatch(
            r"(?:calc|计算)(?::|：)?\s*(.+)", prompt_content, re.IGNORECASE
        )
        if calculator_match:
            expression = calculator_match.group(1)
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "tool.call",
                tool="calculator",
                arguments={"expression": expression},
            ).to_sse()
            try:
                result = calculate(expression)
                reply = f"计算结果：{result:g}"
                tool_data = {"tool": "calculator", "content": {"result": result}}
            except (SyntaxError, ValueError, ZeroDivisionError) as error:
                reply = f"计算失败：{error}"
                tool_data = {"tool": "calculator", "content": {"error": str(error)}}
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "tool.result", **tool_data).to_sse()

        if prompt_content.startswith("json:"):
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "structured_output.delta",
                value={"type": "text", "value": prompt_content.removeprefix("json:").strip()},
            ).to_sse()
        if prompt_content.startswith("ui:"):
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "generative_ui.delta",
                component="NoticeCard",
                props={"text": prompt_content.removeprefix("ui:").strip()},
            ).to_sse()

        if prompt_content.startswith(("search:", "搜索：")):
            request_id = str(uuid4())
            if repository is not None:
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
            _pending_reviews[request_id] = PendingReview(
                run_id,
                request,
                branch_context,
                persisted=repository is not None,
            )
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "tool.call",
                tool="web_search",
                request_id=request_id,
                arguments={"query": prompt_content.split(":", 1)[-1].strip()},
            ).to_sse()
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "tool.approval_required",
                tool="web_search",
                request_id=request_id,
            ).to_sse()
            return

        assistant_content = reply
        use_graph = calculator_match is None and not prompt_content.startswith(("json:", "ui:"))
        if use_graph:
            provider = get_provider_config()
            model = (
                FakeChatModel(chunks=("收到：", prompt_content))
                if provider.provider == "fake"
                else create_chat_model(provider)
            )
            chunks: list[str] = []
            mcp_tools = tuple(build_langchain_tools(mcp_snapshots))
            snapshots_by_name = {
                snapshot.identity.internal_name: snapshot for snapshot in mcp_snapshots
            }
            async for graph_event in stream_graph_events(
                model,
                input_messages,
                run_id=run_id,
                thread_id=request.thread_id,
                tools=[*default_langchain_tools(), *mcp_tools],
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
                        await InterruptRepository(session).create(
                            UUID(run_id),
                            request_id,
                            "mcp_tool",
                            payload,
                            branch_context.checkpoint_id if branch_context else None,
                        )
                        await repository.update_status(UUID(run_id), RunStatus.INTERRUPTED)
                        await session.commit()
                    _pending_reviews[request_id] = PendingReview(
                        run_id,
                        request,
                        branch_context,
                        persisted=repository is not None,
                        mcp_snapshot=snapshot,
                        arguments=arguments,
                    )
                    # MCP SDK 的 AnyIO 上下文必须在建立它的 SSE 任务中关闭，
                    # 审核会切换到另一个请求任务，因此这里先释放连接，恢复时再懒加载。
                    if _mcp_host is not None:
                        await _mcp_host.disconnect(snapshot.identity.server_id)
                    sequence += 1
                    yield _event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "tool.call",
                        tool=tool_name,
                        request_id=request_id,
                        arguments=arguments,
                    ).to_sse()
                    sequence += 1
                    yield _event(
                        run_id,
                        request.thread_id,
                        sequence,
                        "tool.approval_required",
                        tool=tool_name,
                        request_id=request_id,
                    ).to_sse()
                    return
                if graph_event.event == "message.delta":
                    chunks.append(str(graph_event.data.get("content", "")))
                sequence += 1
                yield _event(
                    run_id, request.thread_id, sequence, graph_event.event, **graph_event.data
                ).to_sse()
            assistant_content = "".join(chunks) or reply
        else:
            sequence += 1
            yield _event(
                run_id, request.thread_id, sequence, "message.started", role="assistant"
            ).to_sse()
            if cancel_event.is_set():
                sequence += 1
                yield _event(run_id, request.thread_id, sequence, "run.cancelled").to_sse()
                return
            sequence += 1
            yield _event(
                run_id, request.thread_id, sequence, "message.delta", content=reply
            ).to_sse()
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "message.completed").to_sse()
        if repository is not None and branch_context is not None:
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
                yield _event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "checkpoint.created",
                    checkpoint_id=str(result.checkpoint.id),
                    parent_id=str(result.checkpoint.parent_id),
                ).to_sse()
                sequence += 1
                yield _event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "thread.updated",
                    current_checkpoint_id=str(result.checkpoint.id),
                ).to_sse()
            await repository.update_status(UUID(run_id), RunStatus.COMPLETED)
            await session.commit()
        sequence += 1
        yield _event(run_id, request.thread_id, sequence, "run.completed").to_sse()
    _cancel_events.pop(run_id, None)


async def resumed_run_events(
    run_id: str,
    request: RunRequest,
    request_id: str,
    decision: str,
    session: AsyncSession | None,
    branch_context: RunBranchContext | None,
    pending: PendingReview | None = None,
    edited_payload: dict[str, object] | None = None,
) -> AsyncIterator[str]:
    sequence = 0
    # 演示线程可以在有 PostgreSQL 会话时运行，但它没有对应的数据库 run。
    # 只有确认记录存在，恢复流程才进入持久化分支。
    persisted_session = None
    if session is not None:
        try:
            persisted_session = (
                session if await session.get(Run, UUID(run_id)) is not None else None
            )
        except (ValueError, OSError, RuntimeError):
            await session.rollback()
    repository = RunRepository(persisted_session) if persisted_session is not None else None
    if repository is not None:
        await InterruptRepository(persisted_session).update_status(
            request_id, InterruptStatus.RESUMED
        )
        await repository.update_status(UUID(run_id), RunStatus.RESUMING)
        await persisted_session.commit()
    yield _event(run_id, request.thread_id, sequence, "run.resuming").to_sse()
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
                yield _event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "tool.result",
                    tool=snapshot.identity.internal_name,
                    content={"error": error},
                ).to_sse()
                sequence += 1
                yield _event(
                    run_id, request.thread_id, sequence, "run.failed", error=error
                ).to_sse()
                if repository is not None:
                    await repository.update_status(UUID(run_id), RunStatus.FAILED)
                    await persisted_session.commit()
                return
            except Exception:
                # 非 Host 异常仍使用通用文案，避免意外泄露内部信息。
                error = "MCP 工具调用失败，请检查 Server 状态、地址和凭据"
                yield _event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "tool.result",
                    tool=snapshot.identity.internal_name,
                    content={"error": error},
                ).to_sse()
                sequence += 1
                yield _event(
                    run_id, request.thread_id, sequence, "run.failed", error=error
                ).to_sse()
                if repository is not None:
                    await repository.update_status(UUID(run_id), RunStatus.FAILED)
                    await persisted_session.commit()
                return
        tool_name = snapshot.identity.internal_name
    else:
        result = {"query": request.content.split(":", 1)[-1].strip(), "results": []}
        if decision == "reject":
            result = {"error": "用户拒绝执行搜索"}
        tool_name = "web_search"
    yield _event(
        run_id, request.thread_id, sequence, "tool.result", tool=tool_name, content=result
    ).to_sse()
    sequence += 1
    # 审核恢复必须把工具结果重新交给模型，而不是直接伪造“工具执行完成”。
    answer = "已按要求拒绝工具执行。" if decision == "reject" else "工具执行完成。"
    try:
        provider = get_provider_config()
        model = (
            FakeChatModel(chunks=("收到工具结果：",))
            if provider.provider == "fake"
            else create_chat_model(provider)
        )
        response = await model.ainvoke(
            [
                HumanMessage(content=request.content),
                HumanMessage(
                    content=(
                        "以下是 MCP 工具返回结果，请基于用户问题给出最终答复：\n"
                        + json.dumps(result, ensure_ascii=False)
                    )
                ),
            ]
        )
        content = getattr(response, "content", response)
        if isinstance(content, list):
            content = "".join(
                str(item.get("text", "")) if isinstance(item, dict) else str(item)
                for item in content
            )
        if isinstance(content, str) and content.strip():
            answer = content
    except Exception:
        # 工具已成功执行时，即使二次模型调用失败，也返回可解释的降级答复。
        answer = "工具已执行，但生成最终答复失败，请重试。"
    yield _event(run_id, request.thread_id, sequence, "message.started", role="assistant").to_sse()
    sequence += 1
    yield _event(run_id, request.thread_id, sequence, "message.delta", content=answer).to_sse()
    sequence += 1
    yield _event(run_id, request.thread_id, sequence, "message.completed").to_sse()
    if repository is not None and branch_context is not None:
        thread = await persisted_session.get(Thread, UUID(request.thread_id))
        if thread is not None:
            result = await append_message_checkpoint(
                persisted_session,
                thread,
                parent_id=branch_context.checkpoint_id,
                base_messages=branch_context.messages,
                role=MessageRole.ASSISTANT,
                content={"content": answer},
                run_id=UUID(run_id),
                branch_name="重新生成" if request.mode == "regenerate" else None,
            )
            # HITL 恢复也可能是首轮完成，沿用普通完成路径的最新值检查。
            await persisted_session.refresh(thread, attribute_names=["title"])
            await set_title_after_first_round(
                thread,
                result.messages,
                mode=request.mode,
                user_content=latest_user_content(branch_context.messages, request.content),
                assistant_content=answer,
            )
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "checkpoint.created",
                checkpoint_id=str(result.checkpoint.id),
                parent_id=str(result.checkpoint.parent_id),
            ).to_sse()
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "thread.updated",
                current_checkpoint_id=str(result.checkpoint.id),
            ).to_sse()
        await repository.update_status(UUID(run_id), RunStatus.COMPLETED)
        await persisted_session.commit()
    sequence += 1
    yield _event(run_id, request.thread_id, sequence, "run.completed").to_sse()


async def safe_resumed_run_events(*args: Any, **kwargs: Any) -> AsyncIterator[str]:
    """恢复流的最后一道边界，避免未捕获异常直接表现为浏览器 network error。"""
    run_id = str(args[0]) if args else str(kwargs.get("run_id", "unknown"))
    request = args[1] if len(args) > 1 else kwargs.get("request")
    thread_id = getattr(request, "thread_id", "")
    try:
        async for event in resumed_run_events(*args, **kwargs):
            yield event
    except McpHostError as error:
        yield _event(
            run_id,
            thread_id,
            1,
            "run.failed",
            error=str(error),
        ).to_sse()
    except Exception as error:
        yield _event(
            run_id,
            thread_id,
            1,
            "run.failed",
            error=f"MCP 恢复失败（{type(error).__name__}）",
        ).to_sse()


@router.post("/stream")
async def stream_run(
    request: RunRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    run_id = str(uuid4())
    _cancel_events[run_id] = asyncio.Event()
    persistence_session: AsyncSession | None = None
    branch_context: RunBranchContext | None = None
    try:
        if session is not None:
            try:
                thread_id = UUID(request.thread_id)
            except ValueError:
                thread_id = None
            thread = await session.get(Thread, thread_id) if thread_id is not None else None
            if thread is not None:
                _require_thread_owner(thread, subject)
                branch_context = await _prepare_persisted_run(
                    session,
                    UUID(run_id),
                    request,
                    thread,
                )
        if branch_context is not None:
            persistence_session = session
    except (ValueError, OSError, RuntimeError):
        if session is not None:
            await session.rollback()
    mcp_loader = None
    if persistence_session is not None and _mcp_host is not None and subject is not None:
        async def mcp_loader() -> tuple[McpToolSnapshot, ...]:
            return tuple(
                await load_mcp_snapshots(
                    persistence_session,
                    UUID(subject),
                    _mcp_host,
                    _decode_mcp_credentials,
                )
            )
    return StreamingResponse(
        run_events(
            run_id,
            request,
            persistence_session,
            branch_context,
            mcp_loader=mcp_loader,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_run(
    run_id: str,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> dict[str, str]:
    run = await _persisted_run(session, run_id)
    if run is not None and session is not None:
        await _require_run_owner(session, run, subject)
    cancel_event = _cancel_events.get(run_id)
    if cancel_event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运行不存在")
    cancel_event.set()
    return {"run_id": run_id, "status": "cancelling"}


@router.post("/{run_id}/resume")
async def resume_run(
    run_id: str,
    request: ResumeRequest,
    subject: str | None = Depends(get_optional_subject),
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    pending = _pending_reviews.get(request.request_id)
    # 纯内存 demo interrupt 没有 branch context，不应为了鉴权主动连接数据库。
    # 持久化 interrupt 或服务重启后的恢复才查询 run 所有者。
    requires_persistence = pending is None or pending.persisted
    persisted_run = None
    if requires_persistence:
        if session is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        persisted_run = await _persisted_run(session, run_id)
        if persisted_run is None:
            raise HTTPException(status_code=404, detail="运行不存在")
        await _require_run_owner(session, persisted_run, subject)
    if pending is None and session is not None:
        interrupt = await InterruptRepository(session).get_by_request_id(request.request_id)
        if interrupt is not None and persisted_run is not None and str(interrupt.run_id) == run_id:
            query = str(interrupt.payload.get("query", ""))
            persisted_thread = await session.get(Thread, persisted_run.thread_id)
            branch_context = None
            if persisted_thread is not None:
                checkpoint_id, snapshots = await _load_branch_base(
                    session,
                    persisted_thread,
                    interrupt.checkpoint_id,
                )
                if checkpoint_id is not None:
                    branch_context = RunBranchContext(checkpoint_id, snapshots)
            pending = PendingReview(
                run_id,
                RunRequest(thread_id=str(persisted_run.thread_id), content=f"search: {query}"),
                branch_context,
                persisted=True,
            )
            if interrupt.kind == "mcp_tool":
                server_id = interrupt.payload.get("server_id")
                tool_name = interrupt.payload.get("tool")
                security_version = interrupt.payload.get("security_version")
                arguments = interrupt.payload.get("arguments")
                try:
                    server = await session.get(McpServerDefinition, UUID(str(server_id)))
                except ValueError:
                    server = None
                if (
                    server is None
                    or server.security_version != security_version
                    or _mcp_host is None
                    or subject is None
                ):
                    raise HTTPException(
                        status_code=409,
                        detail="MCP 安全配置已变化，审核请求已失效",
                    )
                snapshots = await load_mcp_snapshots(
                    session,
                    UUID(subject),
                    _mcp_host,
                    _decode_mcp_credentials,
                )
                snapshot = next(
                    (item for item in snapshots if item.identity.internal_name == tool_name),
                    None,
                )
                if snapshot is None:
                    raise HTTPException(status_code=409, detail="MCP 工具已不可用")
                pending = PendingReview(
                    run_id,
                    RunRequest(
                        thread_id=str(persisted_run.thread_id),
                        content="MCP 工具审核",
                    ),
                    branch_context,
                    persisted=True,
                    mcp_snapshot=snapshot,
                    arguments=arguments if isinstance(arguments, dict) else {},
                )
    if pending is None or pending.run_id != run_id:
        raise HTTPException(status_code=409, detail="审核请求不存在或已过期")
    if pending.mcp_snapshot is not None:
        if session is None:
            raise HTTPException(status_code=503, detail="持久化服务不可用")
        try:
            server_id = UUID(pending.mcp_snapshot.identity.server_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail="MCP 审核快照无效") from error
        server = await session.get(McpServerDefinition, server_id)
        if (
            server is None
            or server.security_version != pending.mcp_snapshot.security_version
            or server.deleted_at is not None
        ):
            raise HTTPException(status_code=409, detail="MCP 安全配置已变化，审核请求已失效")
    _pending_reviews.pop(request.request_id, None)
    return StreamingResponse(
        safe_resumed_run_events(
            run_id,
            pending.request,
            request.request_id,
            request.decision,
            session,
            pending.branch_context,
            pending,
            request.payload,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
