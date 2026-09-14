from __future__ import annotations

from collections.abc import Sequence
from copy import deepcopy

from app.db.models import Checkpoint
from app.modules.timeline.domain import empty_timeline, checkpoint_timeline, TimelineSnapshot



def _get_latest_descendant_id(
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
                [{"checkpoint_id": _get_latest_descendant_id(sibling, parent_id_2_children_checkpoint)} for sibling in siblings]
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
