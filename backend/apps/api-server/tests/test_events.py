import re

from fastapi.testclient import TestClient

from app.main import app


def test_run_stream_emits_ordered_business_events() -> None:
    response = TestClient(app).post(
        "/api/runs/stream",
        json={"thread_id": "thread-1", "content": "你好"},
    )

    assert response.status_code == 200
    assert "event: run.started" in response.text
    assert "event: message.delta" in response.text
    assert "event: run.completed" in response.text
    assert response.text.index('"sequence":0') < response.text.index('"sequence":4')


def test_fake_provider_does_not_echo_user_prompt_as_assistant_message() -> None:
    response = TestClient(app).post(
        "/api/runs/stream",
        json={"thread_id": "thread-response", "content": "请解释 LangGraph"},
    )

    assert response.status_code == 200
    assert '"event":"message.delta"' in response.text
    assert '"content":"收到你的消息。"' in response.text
    assert (
        '"event":"message.delta"' in response.text
        and '"content":"请解释 LangGraph"' not in response.text
    )


def test_demo_regenerate_without_checkpoint_keeps_anonymous_stream_protocol() -> None:
    response = TestClient(app).post(
        "/api/runs/stream",
        json={
            "thread_id": "demo-thread",
            "content": "hi",
            "checkpoint_id": None,
            "mode": "regenerate",
        },
    )

    assert response.status_code == 200
    assert "event: run.completed" in response.text


def test_run_stream_emits_tool_events() -> None:
    response = TestClient(app).post(
        "/api/runs/stream",
        json={"thread_id": "thread-tools", "content": "calc: 1 + 2"},
    )

    assert response.status_code == 200
    assert "event: tool.call" in response.text
    assert '"content":{"result":3.0}' in response.text


def test_search_interrupt_can_resume() -> None:
    client = TestClient(app)
    interrupted = client.post(
        "/api/runs/stream",
        json={"thread_id": "thread-review", "content": "search: LangGraph"},
    )
    assert "event: tool.approval_required" in interrupted.text
    run_id = re.search(r'"run_id":"([^"]+)"', interrupted.text).group(1)
    request_id = re.search(r'"request_id":"([^"]+)"', interrupted.text).group(1)

    resumed = client.post(
        f"/api/runs/{run_id}/resume",
        json={"request_id": request_id, "decision": "approve"},
    )

    assert resumed.status_code == 200
    assert "event: run.resuming" in resumed.text
    assert "event: run.completed" in resumed.text
