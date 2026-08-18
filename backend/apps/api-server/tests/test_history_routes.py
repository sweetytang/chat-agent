from fastapi.testclient import TestClient

from app.main import app
from tests.route_helpers import route_paths


def test_timeline_route_replaces_history_and_messages_routes() -> None:
    paths = route_paths(app)
    assert "/api/threads/{thread_id}/timeline" in paths
    assert "/api/threads/{thread_id}/history" not in paths
    assert "/api/threads/{thread_id}/messages" not in paths


def test_timeline_route_requires_authentication() -> None:
    response = TestClient(app).get("/api/threads/00000000-0000-0000-0000-000000000001/timeline")

    assert response.status_code == 401
