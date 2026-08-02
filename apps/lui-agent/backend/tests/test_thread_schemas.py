from uuid import uuid4

from app.modules.threads.schemas import ThreadResponse


def test_thread_response_is_stable_for_frontend_contract() -> None:
    thread_id = uuid4()
    response = ThreadResponse(id=thread_id, title="测试", current_checkpoint_id=None)

    assert response.model_dump() == {
        "id": thread_id,
        "title": "测试",
        "current_checkpoint_id": None,
    }
