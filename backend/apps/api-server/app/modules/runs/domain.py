from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Thread, Checkpoint
from app.modules.runs.schemas import RunRequest
from app.modules.runs.repository import RunRepository
from app.modules.checkpoints.service import (
    RunBranchContext,
    create_run_branch,
)
from app.modules.checkpoints.repository import CheckpointRepository
from app.modules.timeline.domain import checkpoint_timeline, extract_conversation_messages
from lui_agent_runtime.events import RuntimeEvent


def build_event(run_id: str, thread_id: str, sequence: int, name: str, **data: object) -> RuntimeEvent:
    return RuntimeEvent(1, name, run_id, thread_id, sequence, data)


async def prepare_persisted_run(
    session: AsyncSession,
    run_id: UUID,
    request: RunRequest,
    thread: Thread,
) -> RunBranchContext | None:
    parent_checkpoint = await _load_branch_base(
        session,
        thread,
        request.checkpoint_id,
        use_current_if_none="checkpoint_id" not in request.model_fields_set,
    )
    if request.mode == "regenerate" and (
        parent_checkpoint is None
        or extract_conversation_messages(checkpoint_timeline(parent_checkpoint))[-1].get("role") != "user"
    ):
        raise HTTPException(status_code=400, detail="重新生成必须指定用户消息 checkpoint")
    
    await RunRepository(session).create(thread.id, run_id=run_id)
    branch_context = await create_run_branch(
        session,
        thread,
        run_id=run_id,
        mode=request.mode,
        content=request.content,
        parent_checkpoint= parent_checkpoint
    )
    await session.commit()
    return branch_context

async def _load_branch_base(
    session: AsyncSession,
    thread: Thread,
    checkpoint_id: UUID | None,
    *,
    use_current_if_none: bool = True,
) -> Checkpoint | None:
    base_checkpoint_id = (
        thread.current_checkpoint_id
        if checkpoint_id is None and use_current_if_none # 分辨是否是第一条消息
        else checkpoint_id
    )
    if base_checkpoint_id is None:
        return None

    checkpoint = await CheckpointRepository(session).get(thread.id, base_checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="checkpoint 不存在")
    return checkpoint