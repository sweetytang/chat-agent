"""运行模块的核心业务服务门面。"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.utils.to_uuid import to_uuid
from app.db.models import Thread, UserMcpServer
from app.modules.checkpoints.repository import CheckpointRepository
from app.modules.interrupts.repository import InterruptRepository
from app.modules.mcp.agent import McpToolSnapshot, load_server_snapshots
from app.modules.timeline.domain import (
    checkpoint_timeline,
    empty_timeline,
    extract_conversation_messages,
    get_latest_user_content,
)

from .dependencies import run_dependencies_manager
from .driver import managed_run_stream
from .repository import RunRepository
from .resume import generate_resumed_run_events
from .schemas import ResumeRequest, RunContext, RunRequest
from .streaming import generate_run_events


class RunService:
    """运行流程服务门面，统筹协调执行、流式管理与恢复。"""

    @staticmethod
    async def prepare_run_context(
        session: AsyncSession,
        run_id: UUID,
        request: RunRequest,
        thread: Thread,
    ) -> RunContext:
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
        run_id: str,
        request: RunRequest,
        run_context: RunContext | None,
        *,
        session: AsyncSession | None = None,
        mcp_loader: Callable[[], Awaitable[tuple[McpToolSnapshot, ...]]] | None = None,
    ) -> AsyncIterator[str]:
        """开启并执行一个完整的生命周期受控流（Managed Stream）。"""

        return managed_run_stream(
            generate_run_events(
                session,
                run_id,
                request,
                run_context,
                mcp_loader=mcp_loader,
            ),
            session=session,
            run_id=run_id,
            request=request,
            run_context=run_context,
        )

    @staticmethod
    async def stream_resume(
        run_id: str,
        resume_request: ResumeRequest,
        user_id: UUID,
        *,
        session: AsyncSession | None = None,
    ) -> AsyncIterator[str]:
        """恢复已被人工审批中断的运行，并接入受控生命周期管理。"""

        # 唯一事实来源：从数据库加载 interrupt 记录并校验状态
        run_dependencies = run_dependencies_manager.get_run_dependencies()
        persisted_run = await RunRepository(session).get_owned(to_uuid(run_id), user_id)
        if persisted_run is None:
            raise HTTPException(status_code=404, detail="运行不存在")

        interrupt = await InterruptRepository(session).get_by_request_id(resume_request.request_id)
        if interrupt is None:
            raise HTTPException(status=404, detail="恢复记录不存在")
        if str(interrupt.run_id) != run_id:
            raise HTTPException(status=409, detail="审核请求不存在或已过期")

        # 1. 重建 Checkpoint 上下文 (包含 input_checkpoint)
        checkpoint = None
        input_checkpoint = None
        if interrupt.checkpoint_id is not None:
            checkpoint = await CheckpointRepository(session).get(
                persisted_run.thread_id,
                interrupt.checkpoint_id,
            )
            if checkpoint is not None and checkpoint.parent_id is not None:
                input_checkpoint = await CheckpointRepository(session).get(
                    persisted_run.thread_id,
                    checkpoint.parent_id,
                )
        run_context = (
            RunContext(checkpoint=checkpoint, input_checkpoint=input_checkpoint)
            if checkpoint is not None
            else None
        )

        # 2. 从真实的 checkpoint timeline 中提取用户当时的真实提问文本，绝不伪造
        original_user_content = (
            get_latest_user_content(run_context.timeline) if run_context is not None else ""
        )
        request = RunRequest(
            thread_id=str(persisted_run.thread_id),
            content=original_user_content,
        )
        tool_call_id = interrupt.payload.get("tool_call_id")
        arguments = interrupt.payload.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}

        # 3. 处理 MCP 工具快照恢复
        mcp_snapshot = None
        if interrupt.kind == "mcp_tool":
            server_id = interrupt.payload.get("server_id")
            tool_name = interrupt.payload.get("tool")
            try:
                server = await session.get(UserMcpServer, UUID(str(server_id)))
            except ValueError, TypeError:
                server = None

            mcp_host = run_dependencies.get_mcp_host()
            if server is None or not server.enabled or mcp_host is None or user_id is None:
                raise HTTPException(
                    status_code=409,
                    detail="MCP 服务已停用或失效，审核请求不可用",
                )
            server_tools = await load_server_snapshots(
                server,
                mcp_host,
            )
            mcp_snapshot = next(
                snapshot
                for snapshot in server_tools
                if snapshot.identity.internal_name == tool_name
            )
            if mcp_snapshot is None:
                raise HTTPException(status_code=409, detail="MCP 工具已不可用")

        return managed_run_stream(
            generate_resumed_run_events(
                run_id,
                resume_request,
                request,
                run_context,
                tool_call_id,
                arguments,
                user_id=user_id,
                snapshot=mcp_snapshot,
                session=session,
            ),
            run_id=run_id,
            request=request,  # 恢复时由分支快照恢复上下文
            session=session,
            run_context=run_context,
            interrupted_is_terminal=True,
        )

    @staticmethod
    def cancel_run(run_id: str) -> bool:
        """触发目标运行的取消信号。"""
        return run_dependencies_manager.get_run_dependencies().run_coordination.trigger_cancel(
            run_id
        )


run_service = RunService()
