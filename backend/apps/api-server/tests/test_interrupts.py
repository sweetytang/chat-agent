import pytest

from app.integrations.tools.registry import ToolCall
from app.modules.interrupts.service import PendingInterrupt, ReviewDecision, resolve_review


def test_review_edit_returns_edited_calls() -> None:
    call = ToolCall("call-1", "calculator", {"expression": "1+1"})
    pending = PendingInterrupt("request-1", "checkpoint-1", (call,))

    resolved = resolve_review(
        pending,
        request_id="request-1",
        checkpoint_id="checkpoint-1",
        decision=ReviewDecision.EDIT,
        edited_args=({"expression": "2+2"},),
    )

    assert resolved[0].args == {"expression": "2+2"}


def test_stale_review_is_rejected() -> None:
    pending = PendingInterrupt("request-1", "checkpoint-1", ())
    with pytest.raises(ValueError, match="过期"):
        resolve_review(
            pending,
            request_id="request-old",
            checkpoint_id="checkpoint-1",
            decision=ReviewDecision.APPROVE,
        )
