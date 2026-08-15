from fastapi.testclient import TestClient

from app.main import app
from tests.route_helpers import route_paths


def test_history_route_is_exposed() -> None:
    assert "/api/threads/{thread_id}/history" in route_paths(app)


def test_history_route_requires_authentication() -> None:
    response = TestClient(app).get("/api/threads/00000000-0000-0000-0000-000000000001/history")

    assert response.status_code == 401
