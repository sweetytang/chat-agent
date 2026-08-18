import os
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.main import app

pytestmark = pytest.mark.skipif(
    os.getenv("LUI_AGENT_POSTGRES_TEST") != "1",
    reason="需要显式连接本地 PostgreSQL",
)


@pytest.fixture(scope="module")
def client():
    # SQLAlchemy async engine 与 TestClient 共用一个事件循环，避免连接池跨 loop。
    with TestClient(app) as test_client:
        yield test_client


def stream(client: TestClient, thread_id: str, content: str, checkpoint_id, mode: str) -> None:
    response = client.post(
        "/api/runs/stream",
        json={
            "thread_id": thread_id,
            "content": content,
            "checkpoint_id": checkpoint_id,
            "mode": mode,
        },
    )
    assert response.status_code == 200
    assert "event: run.completed" in response.text


def test_edit_regenerate_and_switch_round_trip_with_postgres(client: TestClient) -> None:
    auth = client.post(
        "/api/auth/register",
        json={"email": f"branch-{uuid4()}@example.com", "password": "branch-test-password"},
    )
    assert auth.status_code == 201
    client.headers["Authorization"] = f"Bearer {auth.json()['access_token']}"

    created = client.post("/api/threads", json={})
    assert created.status_code == 201
    assert created.json()["title"] is None
    thread_id = created.json()["id"]

    stream(client, thread_id, "  原问题\n附加说明  ", None, "send")
    generated_title = client.get(f"/api/threads/{thread_id}").json()["title"]
    assert generated_title == "原问题 附加说明相关讨论"
    assert generated_title != "原问题 附加说明"
    original = client.get(f"/api/threads/{thread_id}/timeline").json()
    messages = [item for item in original["timeline"]["items"] if item["kind"] == "message"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    original_user, original_assistant = messages
    assert original_user["parent_checkpoint_id"] is None
    assert original_assistant["parent_checkpoint_id"] == original_user["checkpoint_id"]

    stream(client, thread_id, "编辑后的问题", original_user["parent_checkpoint_id"], "edit")
    assert client.get(f"/api/threads/{thread_id}").json()["title"] == generated_title
    edited = client.get(f"/api/threads/{thread_id}/timeline").json()
    edited_user, edited_assistant = [
        item for item in edited["timeline"]["items"] if item["kind"] == "message"
    ]
    assert edited_user["content"] == "编辑后的问题"
    assert edited_user["branch_index"] == 1
    assert len(edited_user["branch_options"]) == 2

    original_head = edited_user["branch_options"][0]["checkpoint_id"]
    edited_head = edited_user["branch_options"][1]["checkpoint_id"]
    switched = client.post(f"/api/threads/{thread_id}/checkpoints/{original_head}/switch")
    assert switched.status_code == 200
    assert (
        client.get(f"/api/threads/{thread_id}/timeline").json()["timeline"]["items"][0]["content"]
        == "原问题"
    )

    assert (
        client.post(f"/api/threads/{thread_id}/checkpoints/{edited_head}/switch").status_code == 200
    )
    stream(
        client,
        thread_id,
        edited_user["content"],
        edited_assistant["parent_checkpoint_id"],
        "regenerate",
    )
    regenerated = client.get(f"/api/threads/{thread_id}/timeline").json()
    regenerated_user, regenerated_assistant = [
        item for item in regenerated["timeline"]["items"] if item["kind"] == "message"
    ]
    assert regenerated_user["id"] == edited_user["id"]
    assert regenerated_assistant["branch_index"] == 1
    assert len(regenerated_assistant["branch_options"]) == 2


def test_pending_interrupt_survives_refresh_and_clears_after_resume(client: TestClient) -> None:
    auth = client.post(
        "/api/auth/register",
        json={"email": f"interrupt-{uuid4()}@example.com", "password": "interrupt-test-password"},
    )
    assert auth.status_code == 201
    client.headers["Authorization"] = f"Bearer {auth.json()['access_token']}"
    thread_id = client.post("/api/threads", json={"title": "审核恢复测试"}).json()["id"]

    interrupted = client.post(
        "/api/runs/stream",
        json={
            "thread_id": thread_id,
            "content": "search: LangGraph",
            "checkpoint_id": None,
            "mode": "send",
        },
    )
    assert "event: tool.approval_required" in interrupted.text

    pending = client.get(f"/api/threads/{thread_id}/interrupts/pending")
    assert pending.status_code == 200
    pending_body = pending.json()
    assert pending_body["tool"] == "web_search"

    assert (
        client.post(
            f"/api/interrupts/{pending_body['request_id']}/resolve",
            json={"decision": "approve"},
        ).status_code
        == 200
    )
    assert (
        client.get(f"/api/threads/{thread_id}/interrupts/pending").json()["request_id"]
        == pending_body["request_id"]
    )
    resumed = client.post(
        f"/api/runs/{pending_body['run_id']}/resume",
        json={"request_id": pending_body["request_id"], "decision": "approve"},
    )
    assert resumed.status_code == 200
    assert "event: run.completed" in resumed.text
    assert client.get(f"/api/threads/{thread_id}/interrupts/pending").json() is None
