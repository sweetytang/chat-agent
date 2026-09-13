"""运行模块的核心业务服务门面。"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Thread
from app.modules.mcp.agent import McpToolSnapshot
from .coordination import run_coordination
from .domain import prepare_persisted_run
from .resume import safe_resumed_run_events
from .schemas import ResumeRequest, RunRequest, PendingReview, RunBranchContext
from .streaming import managed_run_stream, run_events


class RunService:
    """运行流程服务门面，统筹协调执行、流式管理与恢复。"""

    @staticmethod
    async def prepare_branch(
        session: AsyncSession,
        run_id: UUID,
        request: RunRequest,
        thread: Thread,
    ) -> RunBranchContext | None:
        """为即将开始的运行准备持久化分支上下文。"""

        return await prepare_persisted_run(session, run_id, request, thread)


    @staticmethod
    def stream_run(
        run_id: str,
        request: RunRequest,
        session: AsyncSession | None = None,
        branch_context: RunBranchContext | None = None,
        *,
        mcp_loader: Callable[[], Awaitable[tuple[McpToolSnapshot, ...]]] | None = None,
        interrupted_is_terminal: bool = True,
    ) -> AsyncIterator[str]:
        """开启并执行一个完整的生命周期受控流（Managed Stream）。"""

        inner_events = run_events(
            run_id=run_id,
            request=request,
            session=session,
            branch_context=branch_context,
            mcp_loader=mcp_loader,
        )
        return managed_run_stream(
            inner_events,
            run_id=run_id,
            request=request,
            session=session,
            branch_context=branch_context,
            interrupted_is_terminal=interrupted_is_terminal,
        )


    @staticmethod
    def stream_resume(
        resume_request: ResumeRequest,
        pending_review: PendingReview,
        *,
        session: AsyncSession,
        interrupted_is_terminal: bool = True,
    ) -> AsyncIterator[str]:
        """恢复已被人工审批中断的运行，并接入受控生命周期管理。"""

        if pending_review is None:
            raise ValueError('stream_resume: pending_review can not be None')
        
        stream_events = safe_resumed_run_events(
            resume_request,
            pending_review,
            session=session,
        )
        return managed_run_stream(
            stream_events,
            run_id=pending_review.run_id,
            request=pending_review.request,  # 恢复时由分支快照恢复上下文
            session=session,
            branch_context=pending_review.branch_context,
            interrupted_is_terminal=interrupted_is_terminal,
        )


    @staticmethod
    def cancel_run(run_id: str) -> bool:
        """触发目标运行的取消信号。"""
        return run_coordination.trigger_cancel(run_id)


run_service = RunService()

__all__ = [
    "RunService",
    "managed_run_stream",
    "run_events",
    "run_service",
]
