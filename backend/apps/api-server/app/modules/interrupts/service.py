from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from lui_agent_runtime.tools.registry import ToolCall


class ReviewDecision(StrEnum):
    APPROVE = "approve"
    EDIT = "edit"
    REJECT = "reject"


@dataclass(frozen=True)
class PendingInterrupt:
    request_id: str
    checkpoint_id: str
    calls: tuple[ToolCall, ...]


def resolve_review(
    pending: PendingInterrupt,
    *,
    request_id: str,
    checkpoint_id: str,
    decision: ReviewDecision,
    edited_args: tuple[dict[str, Any], ...] = (),
) -> tuple[ToolCall, ...]:
    if request_id != pending.request_id or checkpoint_id != pending.checkpoint_id:
        raise ValueError("审核请求已过期或不属于当前分支")
    if decision is ReviewDecision.REJECT:
        return ()
    if decision is ReviewDecision.APPROVE:
        return pending.calls
    if len(edited_args) != len(pending.calls):
        raise ValueError("编辑后的工具参数数量不一致")
    return tuple(
        ToolCall(call.id, call.name, args)
        for call, args in zip(pending.calls, edited_args, strict=True)
    )
