from uuid import uuid4

from pydantic import ValidationError
import pytest

from app.modules.threads.schemas import ThreadResponse, UpdateThreadRequest


def test_thread_response_is_stable_for_frontend_contract() -> None:
    thread_id = uuid4()
    response = ThreadResponse(
        id=thread_id, title="测试", is_pinned=True, current_checkpoint_id=None
    )

    assert response.model_dump() == {
        "id": thread_id,
        "title": "测试",
        "is_pinned": True,
        "current_checkpoint_id": None,
    }


def test_thread_update_trims_title_and_rejects_empty_payload() -> None:
    assert UpdateThreadRequest(title="  新标题  ").title == "新标题"

    with pytest.raises(ValidationError):
        UpdateThreadRequest(title="  ")
    with pytest.raises(ValidationError):
        UpdateThreadRequest()
