from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint, Message, MessageRole, Thread
from app.modules.runs.repository import RunRepository
from app.modules.threads.repository import ThreadRepository

MessageSnapshot = dict[str, Any]


@dataclass(frozen=True)
class MessageCheckpointResult:
    checkpoint: Checkpoint
    message: Message
    messages: tuple[MessageSnapshot, ...]


@dataclass(frozen=True)
class RunBranchContext:
    checkpoint_id: UUID
    messages: tuple[MessageSnapshot, ...]
    created_checkpoint: Checkpoint | None = None


def message_snapshot(message: Message) -> MessageSnapshot:
    role = message.role.value if isinstance(message.role, MessageRole) else str(message.role)
    return {
        "id": str(message.id),
        "role": role,
        "content": deepcopy(message.content),
        "checkpoint_id": str(message.checkpoint_id) if message.checkpoint_id else None,
    }


def checkpoint_messages(checkpoint: Checkpoint | None) -> tuple[MessageSnapshot, ...] | None:
    if checkpoint is None or not isinstance(checkpoint.state, dict):
        return None
    messages = checkpoint.state.get("messages")
    if not isinstance(messages, list):
        return None
    return tuple(deepcopy(item) for item in messages if isinstance(item, dict))


def model_messages(messages: Sequence[MessageSnapshot]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for message in messages:
        content = message.get("content", {})
        if isinstance(content, dict):
            content = content.get("content", "")
        result.append({"role": str(message.get("role", "user")), "content": content})
    return result


def latest_user_content(messages: Sequence[MessageSnapshot], fallback: str) -> str:
    for message in reversed(messages):
        if message.get("role") != MessageRole.USER.value:
            continue
        content = message.get("content", {})
        if isinstance(content, dict):
            content = content.get("content", "")
        return content if isinstance(content, str) else fallback
    return fallback


async def append_message_checkpoint(
    session: AsyncSession,
    thread: Thread,
    *,
    parent_id: UUID | None,
    base_messages: Sequence[MessageSnapshot],
    role: MessageRole,
    content: dict[str, Any],
    run_id: UUID,
    branch_name: str | None = None,
) -> MessageCheckpointResult:
    """在同一事务中创建 checkpoint、消息及完整分支快照。"""

    checkpoint = await ThreadRepository(session).append_checkpoint(
        thread,
        {"messages": [deepcopy(item) for item in base_messages]},
        parent_id,
        branch_name,
    )
    message = await RunRepository(session).append_message(
        thread.id,
        role,
        content,
        run_id=run_id,
        checkpoint_id=checkpoint.id,
    )
    messages = (*deepcopy(tuple(base_messages)), message_snapshot(message))
    checkpoint.state = {"messages": list(messages)}
    await session.flush()
    return MessageCheckpointResult(checkpoint, message, messages)


async def create_run_branch(
    session: AsyncSession,
    thread: Thread,
    *,
    run_id: UUID,
    mode: str,
    content: str,
    base_checkpoint_id: UUID | None,
    base_messages: Sequence[MessageSnapshot],
) -> RunBranchContext:
    if mode == "regenerate":
        if base_checkpoint_id is None:
            raise ValueError("重新生成必须指定用户消息 checkpoint")
        return RunBranchContext(base_checkpoint_id, tuple(deepcopy(tuple(base_messages))))

    result = await append_message_checkpoint(
        session,
        thread,
        parent_id=base_checkpoint_id,
        base_messages=base_messages,
        role=MessageRole.USER,
        content={"content": content},
        run_id=run_id,
        branch_name="编辑分支" if mode == "edit" else None,
    )
    return RunBranchContext(result.checkpoint.id, result.messages, result.checkpoint)


def project_history_messages(
    selected_checkpoint: Checkpoint | None,
    checkpoints: Sequence[Checkpoint],
    fallback_messages: Sequence[Message],
) -> list[dict[str, Any]]:
    snapshots = checkpoint_messages(selected_checkpoint)
    if snapshots is None:
        snapshots = tuple(message_snapshot(message) for message in fallback_messages)

    checkpoint_by_id = {str(checkpoint.id): checkpoint for checkpoint in checkpoints}
    children_by_parent: dict[str | None, list[Checkpoint]] = {}
    for checkpoint in checkpoints:
        parent_id = str(checkpoint.parent_id) if checkpoint.parent_id else None
        children_by_parent.setdefault(parent_id, []).append(checkpoint)

    result: list[dict[str, Any]] = []
    for snapshot in snapshots:
        checkpoint_id = snapshot.get("checkpoint_id")
        checkpoint_key = str(checkpoint_id) if checkpoint_id else None
        introduced_at = checkpoint_by_id.get(checkpoint_key) if checkpoint_key else None
        parent_id = str(introduced_at.parent_id) if introduced_at and introduced_at.parent_id else None
        siblings = children_by_parent.get(parent_id, []) if introduced_at else []
        options = []
        branch_index = None
        if len(siblings) > 1:
            options = [
                {"checkpoint_id": _latest_descendant_id(sibling, children_by_parent)}
                for sibling in siblings
            ]
            branch_index = next(
                (index for index, sibling in enumerate(siblings) if sibling.id == introduced_at.id),
                None,
            )

        content = snapshot.get("content", {})
        if isinstance(content, dict):
            content = content.get("content", "")
        if not isinstance(content, str):
            content = str(content)
        result.append(
            {
                "id": snapshot.get("id"),
                "role": snapshot.get("role"),
                "content": deepcopy(content),
                "checkpoint_id": checkpoint_id,
                "parent_checkpoint_id": parent_id,
                "branch_options": options,
                "branch_index": branch_index,
            }
        )
    return result


def _latest_descendant_id(
    checkpoint: Checkpoint,
    children_by_parent: dict[str | None, list[Checkpoint]],
) -> str:
    current = checkpoint
    while children := children_by_parent.get(str(current.id), []):
        current = children[-1]
    return str(current.id)
