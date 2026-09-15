"""运行模块的核心业务服务门面。"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Thread
from app.modules.checkpoints.repository import CheckpointRepository
from app.modules.timeline.domain import (
    checkpoint_timeline,
    extract_conversation_messages,
    empty_timeline,
)
from app.modules.mcp.agent import McpToolSnapshot
from .repository import RunRepository
from .dependencies import run_dependencies_manager
from .resume import safe_generate_resumed_run_events
from .schemas import ResumeRequest, RunRequest, PendingReview, RunContext
from .streaming import managed_run_stream, generate_run_events


class RunService:
    """运行流程服务门面，统筹协调执行、流式管理与恢复。"""

    @staticmethod
    async def prepare_run_context(
        session: AsyncSession,
        run_id: UUID,
        request: RunRequest,
        thread: Thread,
    ) -> RunContext | None:
        """加载上文的checkpoint，准备接下来的user、assistant的checkpoint"""

        # 1.加载上下文
        # 优先相信前端显式指定的父节点（无论它是合法 UUID 还是 None 表示根节点）
        # 只有在完全没传该字段时（比如三方脚本简易调用），才退化为取 thread.current_checkpoint_id
        base_checkpoint_id = (
            thread.current_checkpoint_id
            if request.checkpoint_id is None
            and "checkpoint_id" not in request.model_fields_set  # 没传checkpoint_id
            else request.checkpoint_id
        )
        base_checkpoint = None
        if base_checkpoint_id is not None:
            base_checkpoint = await CheckpointRepository(session).get(thread.id, base_checkpoint_id)

        if base_checkpoint_id is not None and base_checkpoint is None:
            raise HTTPException(status_code=404, detail="checkpoint 不存在")

        if request.mode == "regenerate" and (
            base_checkpoint is None
            or extract_conversation_messages(checkpoint_timeline(base_checkpoint))[-1].get("role")
            != "user"
        ):
            raise HTTPException(status_code=400, detail="重新生成必须指定用户消息 checkpoint")

        await RunRepository(session).create(thread.id, run_id=run_id)

        # 2. 如果是重新生成，直接跳过新建 user checkpoint；否则新建一条 user checkpoint
        input_checkpoint = base_checkpoint
        if request.mode != "regenerate":
            timeline = (
                checkpoint_timeline(input_checkpoint)
                if input_checkpoint is not None
                else empty_timeline()
            )
            item_id = str(uuid4())
            timeline["items"].append(
                {
                    "id": item_id,
                    "kind": "message",
                    "run_id": str(run_id),
                    "sequence": -1,
                    "logical_message_id": item_id,
                    "role": "user",
                    "content": request.content,
                    "status": "completed",
                    "terminal_segment": True,
                }
            )
            input_checkpoint = await CheckpointRepository(session).append(
                thread,
                {"timeline": timeline},
                input_checkpoint.id if input_checkpoint is not None else None,
                "编辑分支" if request.mode == "edit" else None,
            )

        # 3. 生成agent回复的占位Checkpoint
        agent_checkpoint = await CheckpointRepository(session).append(
            thread,
            {"timeline": checkpoint_timeline(input_checkpoint)},
            input_checkpoint.id,
            "重新生成" if request.mode == "regenerate" else None,
        )

        await session.commit()

        return RunContext(
            checkpoint=agent_checkpoint,
            input_checkpoint=input_checkpoint,
        )

    @staticmethod
    def stream_run(
        session: AsyncSession | None,
        run_id: str,
        request: RunRequest,
        run_context: RunContext | None,
        *,
        mcp_loader: Callable[[], Awaitable[tuple[McpToolSnapshot, ...]]] | None = None,
    ) -> AsyncIterator[str]:
        """开启并执行一个完整的生命周期受控流（Managed Stream）。"""

        inner_events = generate_run_events(
            session,
            run_id,
            request,
            run_context,
            mcp_loader=mcp_loader,
        )
        return managed_run_stream(
            inner_events,
            session=session,
            run_id=run_id,
            request=request,
            run_context=run_context,
        )

    @staticmethod
    def stream_resume(
        resume_request: ResumeRequest,
        pending_review: PendingReview,
        *,
        session: AsyncSession,
    ) -> AsyncIterator[str]:
        """恢复已被人工审批中断的运行，并接入受控生命周期管理。"""

        if pending_review is None:
            raise ValueError("stream_resume: pending_review can not be None")

        stream_events = safe_generate_resumed_run_events(
            resume_request,
            pending_review,
            session=session,
        )
        return managed_run_stream(
            stream_events,
            run_id=pending_review.run_id,
            request=pending_review.request,  # 恢复时由分支快照恢复上下文
            session=session,
            run_context=pending_review.run_context,
            interrupted_is_terminal=False,
        )

    @staticmethod
    def cancel_run(run_id: str) -> bool:
        """触发目标运行的取消信号。"""
        return run_dependencies_manager.get_run_dependencies().run_coordination.trigger_cancel(
            run_id
        )


run_service = RunService()


__all__ = [
    "run_service",
]
