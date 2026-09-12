from __future__ import annotations

from collections.abc import Sequence
from copy import deepcopy
from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint, Thread
from app.modules.threads.repository import ThreadRepository
from .repository import CheckpointRepository
from app.modules.timeline.projector import conversation_messages, latest_user_content
from app.modules.timeline.domain import empty_timeline, checkpoint_timeline, TimelineSnapshot


@dataclass(frozen=True)
class RunBranchContext:
    checkpoint_id: UUID
    timeline: TimelineSnapshot
    checkpoint: Checkpoint | None = None
    input_checkpoint: Checkpoint | None = None


async def _append_user_checkpoint(
    session: AsyncSession,
    thread: Thread,
    *,
    parent_checkpoint: Checkpoint | None,
    content: str,
    run_id: UUID,
    branch_name: str | None = None,
) -> Checkpoint:
    timeline = checkpoint_timeline(parent_checkpoint) if parent_checkpoint is not None else empty_timeline()
    item_id = str(uuid4())
    timeline["items"].append(
        {
            "id": item_id,
            "kind": "message",
            "run_id": str(run_id),
            "sequence": -1,
            "logical_message_id": item_id,
            "role": "user",
            "content": content,
            "status": "completed",
            "terminal_segment": True,
        }
    )
    checkpoint = await CheckpointRepository(session).append(
        thread,
        {"timeline": timeline},
        parent_checkpoint.id if parent_checkpoint is not None else None,
        branch_name,
    )
    return checkpoint


async def _append_agent_checkpoint(
    session: AsyncSession,
    thread: Thread,
    *,
    input_checkpoint: Checkpoint,
    branch_name: str | None = None,
) -> Checkpoint:
    return await CheckpointRepository(session).append(
        thread,
        {"timeline": checkpoint_timeline(input_checkpoint)},
        input_checkpoint.id,
        branch_name,
    )


async def create_run_branch(
    session: AsyncSession,
    thread: Thread,
    *,
    run_id: UUID,
    mode: str,
    content: str,
    parent_checkpoint: Checkpoint | None,
) -> RunBranchContext:
    """根据上文的checkpoint，准备接下来的user、assistant的checkpoint"""

    input_checkpoint = parent_checkpoint

    match mode:
        case "regenerate":
            if input_checkpoint is None:
                raise ValueError("重新生成必须指定用户消息 checkpoint")
        case _:
            input_checkpoint = await _append_user_checkpoint(
                session,
                thread,
                parent_checkpoint=input_checkpoint,
                content=content,
                run_id=run_id,
                branch_name="编辑分支" if mode == "edit" else None,
            )

    assert input_checkpoint is not None

    agent_checkpoint = await _append_agent_checkpoint(
        session,
        thread,
        input_checkpoint=input_checkpoint,
        branch_name="重新生成" if mode == "regenerate" else None,
    )
    
    return RunBranchContext(
        agent_checkpoint.id,
        timeline = checkpoint_timeline(input_checkpoint),
        checkpoint=agent_checkpoint,
        input_checkpoint=input_checkpoint,
    )


def _latest_descendant_id(
    checkpoint: Checkpoint,
    parent_id_2_children_checkpoint: dict[str | None, list[Checkpoint]],
) -> str:
    """切换分支 规定切到分支的最新路线 表现为最右边路线"""

    current = checkpoint
    while children := parent_id_2_children_checkpoint.get(str(current.id), []):
        current = children[-1]
    return str(current.id)


def resolve_timeline_branch(
    selected_checkpoint: Checkpoint | None,
    checkpoints: Sequence[Checkpoint],
) -> TimelineSnapshot:
    """根据当前checkpoint和全部checkpoint，处理当前checkpoint中每条消息的分支数据"""

    if selected_checkpoint is None:
        return empty_timeline()

    # 第一步：构建索引
    id_to_checkpoint = {str(checkpoint.id): checkpoint for checkpoint in checkpoints}
    parent_id_2_children_checkpoint: dict[str | None, list[Checkpoint]] = {}
    for checkpoint in checkpoints:
        parent_id = str(checkpoint.parent_id) if checkpoint.parent_id else None
        parent_id_2_children_checkpoint.setdefault(parent_id, []).append(checkpoint)

    # 第二步：回溯当前的checkpoint链
    lineage: list[Checkpoint] = []
    current: Checkpoint | None = selected_checkpoint
    while current is not None:
        lineage.append(current)
        current = id_to_checkpoint.get(str(current.parent_id)) if current.parent_id else None
    lineage.reverse()

    # 第三步：寻找消息最先由哪条checkpoint引入
    item_id_2_checkpoint: dict[str, Checkpoint] = {}
    previous_count = 0
    for checkpoint in lineage:
        items = checkpoint_timeline(checkpoint).get("items", [])
        for item in items[previous_count:]:
            item_id = item.get("id")
            if isinstance(item_id, str) and item_id:
                item_id_2_checkpoint[item_id] = checkpoint
        previous_count = len(items)

    #  第四步：判断当前checkpoint-items的每条消息是否有兄弟节点（分支）
    result = deepcopy(checkpoint_timeline(selected_checkpoint))
    for item in result["items"]:
        item_checkpoint = item_id_2_checkpoint.get(item.get("id"))
        if item_checkpoint is None:
            continue

        parent_id = str(item_checkpoint.parent_id) if item_checkpoint.parent_id else None
        siblings = parent_id_2_children_checkpoint.get(parent_id, [])
        item.update({
            "checkpoint_id": str(item_checkpoint.id),
            "parent_checkpoint_id": parent_id,
            "branch_options": (
                [{"checkpoint_id": _latest_descendant_id(sibling, parent_id_2_children_checkpoint)} for sibling in siblings]
                if len(siblings) > 1
                else []
            ),
            "branch_index": (
                next((i for i, s in enumerate(siblings) if s.id == item_checkpoint.id), 0)
                if len(siblings) > 1
                else None
            )
        })
        
    return result


__all__ = [
    "RunBranchContext",
    "latest_user_content",
    "conversation_messages",
    "create_run_branch",
    "resolve_timeline_branch",
]
