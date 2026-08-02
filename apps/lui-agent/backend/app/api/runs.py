from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.events import BusinessEvent
from app.integrations.tools.registry import calculate
from app.db.models import InterruptStatus, MessageRole, Run, RunStatus, Thread
from app.db.session import get_optional_db_session
from app.modules.runs.repository import RunRepository
from app.modules.interrupts.repository import InterruptRepository
from app.modules.threads.repository import ThreadRepository
from app.graph.runtime import stream_graph_events
from app.integrations.llm.config import get_provider_config
from app.integrations.llm.factory import create_chat_model
from app.integrations.llm.fake import FakeChatModel
from app.integrations.tools.langchain import default_langchain_tools

router = APIRouter(prefix="/api/runs", tags=["runs"])

_thread_locks: dict[str, asyncio.Lock] = {}
_cancel_events: dict[str, asyncio.Event] = {}
_pending_reviews: dict[str, tuple[str, RunRequest]] = {}


class RunRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    checkpoint_id: UUID | None = None
    mode: str = Field(default="send", pattern="^(send|edit|regenerate)$")


class ResumeRequest(BaseModel):
    request_id: str = Field(min_length=1)
    decision: str = Field(pattern="^(approve|edit|reject)$")
    payload: dict[str, object] | None = None


def _thread_lock(thread_id: str) -> asyncio.Lock:
    return _thread_locks.setdefault(thread_id, asyncio.Lock())


def _event(run_id: str, thread_id: str, sequence: int, name: str, **data: object) -> BusinessEvent:
    return BusinessEvent(1, name, run_id, thread_id, sequence, data)


async def run_events(
    run_id: str,
    request: RunRequest,
    session: AsyncSession | None = None,
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
        repository = RunRepository(session) if session is not None else None
        if repository is not None:
            await repository.update_status(UUID(run_id), RunStatus.RUNNING)
            await session.commit()
        if request.content.startswith(("think:", "思考：")):
            sequence += 1
            yield _event(
                run_id, request.thread_id, sequence, "reasoning.delta", content="正在分析请求并选择合适的执行路径。"
            ).to_sse()

        reply = f"收到：{request.content}"
        calculator_match = re.fullmatch(r"(?:calc|计算)(?::|：)?\s*(.+)", request.content, re.IGNORECASE)
        if calculator_match:
            expression = calculator_match.group(1)
            sequence += 1
            yield _event(
                run_id, request.thread_id, sequence, "tool.call", tool="calculator", arguments={"expression": expression}
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

        if request.content.startswith("json:"):
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "structured_output.delta",
                value={"type": "text", "value": request.content.removeprefix("json:").strip()},
            ).to_sse()
        if request.content.startswith("ui:"):
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "generative_ui.delta",
                component="NoticeCard",
                props={"text": request.content.removeprefix("ui:").strip()},
            ).to_sse()

        if request.content.startswith(("search:", "搜索：")):
            request_id = str(uuid4())
            if repository is not None:
                await InterruptRepository(session).create(
                    UUID(run_id), request_id, "tool", {"query": request.content.split(":", 1)[-1].strip()}
                )
                await repository.update_status(UUID(run_id), RunStatus.INTERRUPTED)
                await session.commit()
            _pending_reviews[request_id] = (run_id, request)
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "tool.call", tool="web_search", request_id=request_id, arguments={"query": request.content.split(":", 1)[-1].strip()}).to_sse()
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "tool.approval_required", tool="web_search", request_id=request_id).to_sse()
            return

        assistant_content = reply
        use_graph = calculator_match is None and not request.content.startswith(("json:", "ui:"))
        if use_graph:
            provider = get_provider_config()
            model = FakeChatModel(chunks=("收到：", request.content)) if provider.provider == "fake" else create_chat_model(provider)
            chunks: list[str] = []
            async for graph_event in stream_graph_events(
                model,
                [{"role": "user", "content": request.content}],
                run_id=run_id,
                thread_id=request.thread_id,
                tools=default_langchain_tools(),
                continue_after_tools=True,
            ):
                if graph_event.event == "message.delta":
                    chunks.append(str(graph_event.data.get("content", "")))
                sequence += 1
                yield _event(run_id, request.thread_id, sequence, graph_event.event, **graph_event.data).to_sse()
            assistant_content = "".join(chunks) or reply
        else:
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "message.started", role="assistant").to_sse()
            if cancel_event.is_set():
                sequence += 1
                yield _event(run_id, request.thread_id, sequence, "run.cancelled").to_sse()
                return
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "message.delta", content=reply).to_sse()
            sequence += 1
            yield _event(run_id, request.thread_id, sequence, "message.completed").to_sse()
        if repository is not None:
            await repository.append_message(
                UUID(request.thread_id),
                MessageRole.ASSISTANT,
                {"content": assistant_content},
                run_id=UUID(run_id),
            )
            thread = await session.get(Thread, UUID(request.thread_id))
            if thread is not None:
                parent_id = request.checkpoint_id or thread.current_checkpoint_id
                created_checkpoint = await ThreadRepository(session).append_checkpoint(
                    thread,
                    {"content": assistant_content, "run_id": run_id, "mode": request.mode},
                    parent_id,
                    "分支" if request.mode in {"edit", "regenerate"} else None,
                )
                sequence += 1
                yield _event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "checkpoint.created",
                    checkpoint_id=str(created_checkpoint.id),
                    parent_id=str(parent_id) if parent_id else None,
                ).to_sse()
                sequence += 1
                yield _event(
                    run_id,
                    request.thread_id,
                    sequence,
                    "thread.updated",
                    current_checkpoint_id=str(created_checkpoint.id),
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
) -> AsyncIterator[str]:
    sequence = 0
    # 演示线程可以在有 PostgreSQL 会话时运行，但它没有对应的数据库 run。
    # 只有确认记录存在，恢复流程才进入持久化分支。
    persisted_session = None
    if session is not None:
        try:
            persisted_session = session if await session.get(Run, UUID(run_id)) is not None else None
        except (ValueError, OSError, RuntimeError):
            await session.rollback()
    repository = RunRepository(persisted_session) if persisted_session is not None else None
    if repository is not None:
        await InterruptRepository(persisted_session).update_status(request_id, InterruptStatus.RESUMED)
        await repository.update_status(UUID(run_id), RunStatus.RESUMING)
        await persisted_session.commit()
    yield _event(run_id, request.thread_id, sequence, "run.resuming").to_sse()
    sequence += 1
    result = {"query": request.content.split(":", 1)[-1].strip(), "results": []}
    if decision == "reject":
        result = {"error": "用户拒绝执行搜索"}
    yield _event(run_id, request.thread_id, sequence, "tool.result", tool="web_search", content=result).to_sse()
    sequence += 1
    yield _event(run_id, request.thread_id, sequence, "message.started", role="assistant").to_sse()
    sequence += 1
    answer = "已完成搜索。" if decision != "reject" else "已按要求拒绝搜索。"
    yield _event(run_id, request.thread_id, sequence, "message.delta", content=answer).to_sse()
    sequence += 1
    yield _event(run_id, request.thread_id, sequence, "message.completed").to_sse()
    if repository is not None:
        await repository.append_message(UUID(request.thread_id), MessageRole.ASSISTANT, {"content": answer}, run_id=UUID(run_id))
        thread = await persisted_session.get(Thread, UUID(request.thread_id))
        if thread is not None:
            checkpoint = await ThreadRepository(persisted_session).append_checkpoint(
                thread,
                {"content": answer, "run_id": run_id, "mode": "send"},
                thread.current_checkpoint_id,
            )
            sequence += 1
            yield _event(
                run_id,
                request.thread_id,
                sequence,
                "checkpoint.created",
                checkpoint_id=str(checkpoint.id),
                parent_id=str(checkpoint.parent_id) if checkpoint.parent_id else None,
            ).to_sse()
        await repository.update_status(UUID(run_id), RunStatus.COMPLETED)
        await persisted_session.commit()
    sequence += 1
    yield _event(run_id, request.thread_id, sequence, "run.completed").to_sse()


@router.post("/stream")
async def stream_run(
    request: RunRequest,
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    run_id = str(uuid4())
    _cancel_events[run_id] = asyncio.Event()
    persistence_session: AsyncSession | None = None
    try:
        thread_id = UUID(request.thread_id)
        if session is not None and await session.get(Thread, thread_id) is not None:
            if request.checkpoint_id is not None:
                if await ThreadRepository(session).get_checkpoint(thread_id, request.checkpoint_id) is None:
                    raise HTTPException(status_code=404, detail="checkpoint 不存在")
            repository = RunRepository(session)
            await repository.create(thread_id, run_id=UUID(run_id))
            await repository.append_message(
                thread_id,
                MessageRole.USER,
                {"content": request.content},
                run_id=UUID(run_id),
            )
            await session.commit()
            persistence_session = session
    except (ValueError, OSError, RuntimeError):
        if session is not None:
            await session.rollback()
    return StreamingResponse(
        run_events(run_id, request, persistence_session),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_run(run_id: str) -> dict[str, str]:
    cancel_event = _cancel_events.get(run_id)
    if cancel_event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运行不存在")
    cancel_event.set()
    return {"run_id": run_id, "status": "cancelling"}


@router.post("/{run_id}/resume")
async def resume_run(
    run_id: str,
    request: ResumeRequest,
    session: AsyncSession | None = Depends(get_optional_db_session),
) -> StreamingResponse:
    pending = _pending_reviews.get(request.request_id)
    if pending is None and session is not None:
        interrupt = await InterruptRepository(session).get_by_request_id(request.request_id)
        persisted_run = await session.get(Run, UUID(run_id)) if interrupt is not None else None
        if interrupt is not None and persisted_run is not None and str(interrupt.run_id) == run_id:
            query = str(interrupt.payload.get("query", ""))
            pending = (run_id, RunRequest(thread_id=str(persisted_run.thread_id), content=f"search: {query}"))
    if pending is None or pending[0] != run_id:
        raise HTTPException(status_code=409, detail="审核请求不存在或已过期")
    _pending_reviews.pop(request.request_id, None)
    return StreamingResponse(
        resumed_run_events(run_id, pending[1], request.request_id, request.decision, session),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
