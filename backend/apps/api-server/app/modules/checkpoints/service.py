from __future__ import annotations

from collections.abc import Sequence
from copy import deepcopy
from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint, Thread
from app.modules.threads.repository import ThreadRepository
from app.modules.timeline.projector import conversation_messages, latest_user_content
from app.modules.timeline.types import (
    TimelineSnapshot,
    checkpoint_timeline,
    empty_timeline,
    validate_timeline,
)


@dataclass(frozen=True)
class RunBranchContext:
    checkpoint_id: UUID
    timeline: TimelineSnapshot
    checkpoint: Checkpoint | None = None
    input_checkpoint: Checkpoint | None = None


async def append_user_checkpoint(
    session: AsyncSession,
    thread: Thread,
    *,
    parent_id: UUID | None,
    base_timeline: TimelineSnapshot,
    content: str,
    run_id: UUID,
    branch_name: str | None = None,
) -> tuple[Checkpoint, TimelineSnapshot]:
    timeline = validate_timeline(base_timeline)
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
    checkpoint = await ThreadRepository(session).append_checkpoint(
        thread,
        {"timeline": timeline},
        parent_id,
        branch_name,
    )
    return checkpoint, timeline


async def append_agent_checkpoint(
    session: AsyncSession,
    thread: Thread,
    *,
    parent_id: UUID,
    base_timeline: TimelineSnapshot,
    branch_name: str | None = None,
) -> Checkpoint:
    return await ThreadRepository(session).append_checkpoint(
        thread,
        {"timeline": validate_timeline(base_timeline)},
        parent_id,
        branch_name,
    )


async def create_run_branch(
    session: AsyncSession,
    thread: Thread,
    *,
    run_id: UUID,
    mode: str,
    content: str,
    base_checkpoint_id: UUID | None,
    base_timeline: TimelineSnapshot,
) -> RunBranchContext:
    timeline = validate_timeline(base_timeline)
    input_checkpoint = None
    input_checkpoint_id = base_checkpoint_id

    if mode != "regenerate":
        input_checkpoint, timeline = await append_user_checkpoint(
            session,
            thread,
            parent_id=base_checkpoint_id,
            base_timeline=timeline,
            content=content,
            run_id=run_id,
            branch_name="编辑分支" if mode == "edit" else None,
        )
        input_checkpoint_id = input_checkpoint.id
    elif input_checkpoint_id is None:
        raise ValueError("重新生成必须指定用户消息 checkpoint")

    assert input_checkpoint_id is not None
    agent_checkpoint = await append_agent_checkpoint(
        session,
        thread,
        parent_id=input_checkpoint_id,
        base_timeline=timeline,
        branch_name="重新生成" if mode == "regenerate" else None,
    )
    return RunBranchContext(
        agent_checkpoint.id,
        timeline,
        checkpoint=agent_checkpoint,
        input_checkpoint=input_checkpoint,
    )


def model_messages(snapshot: TimelineSnapshot) -> list[dict[str, str]]:
    return conversation_messages(snapshot)


def _latest_descendant_id(
    checkpoint: Checkpoint,
    children_by_parent: dict[str | None, list[Checkpoint]],
) -> str:
    current = checkpoint
    while children := children_by_parent.get(str(current.id), []):
        current = children[-1]
    return str(current.id)


def project_timeline(
    selected_checkpoint: Checkpoint | None,
    checkpoints: Sequence[Checkpoint],
) -> TimelineSnapshot:
    if selected_checkpoint is None:
        return empty_timeline()

    snapshot = checkpoint_timeline(selected_checkpoint.state)
    by_id = {str(checkpoint.id): checkpoint for checkpoint in checkpoints}
    children_by_parent: dict[str | None, list[Checkpoint]] = {}
    for checkpoint in checkpoints:
        parent_id = str(checkpoint.parent_id) if checkpoint.parent_id else None
        children_by_parent.setdefault(parent_id, []).append(checkpoint)

    lineage: list[Checkpoint] = []
    current: Checkpoint | None = selected_checkpoint
    while current is not None:
        lineage.append(current)
        current = by_id.get(str(current.parent_id)) if current.parent_id else None
    lineage.reverse()

    introduced_at: dict[str, Checkpoint] = {}
    previous_ids: set[str] = set()
    for checkpoint in lineage:
        timeline = checkpoint_timeline(checkpoint.state)
        current_ids = {
            str(item.get("id")) for item in timeline["items"] if isinstance(item.get("id"), str)
        }
        for item_id in current_ids - previous_ids:
            introduced_at[item_id] = checkpoint
        previous_ids = current_ids

    result = deepcopy(snapshot)
    for item in result["items"]:
        introduced_checkpoint = introduced_at.get(str(item.get("id")))
        if introduced_checkpoint is None:
            continue
        parent_id = (
            str(introduced_checkpoint.parent_id) if introduced_checkpoint.parent_id else None
        )
        siblings = children_by_parent.get(parent_id, [])
        item["checkpoint_id"] = str(introduced_checkpoint.id)
        item["parent_checkpoint_id"] = parent_id
        item["branch_options"] = (
            [
                {"checkpoint_id": _latest_descendant_id(sibling, children_by_parent)}
                for sibling in siblings
            ]
            if len(siblings) > 1
            else []
        )
        item["branch_index"] = (
            next(
                (
                    index
                    for index, sibling in enumerate(siblings)
                    if sibling.id == introduced_checkpoint.id
                ),
                0,
            )
            if len(siblings) > 1
            else None
        )
    return result


__all__ = [
    "RunBranchContext",
    "checkpoint_timeline",
    "create_run_branch",
    "latest_user_content",
    "model_messages",
    "project_timeline",
]
