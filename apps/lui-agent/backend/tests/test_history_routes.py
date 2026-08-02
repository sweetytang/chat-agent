from app.main import app
from tests.route_helpers import route_paths


def test_history_route_is_exposed() -> None:
    assert "/api/threads/{thread_id}/messages" in route_paths(app)
