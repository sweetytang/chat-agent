from app.main import app
from tests.route_helpers import route_paths


def test_thread_routes_are_exposed() -> None:
    routes = route_paths(app)

    assert {"/api/threads", "/api/threads/{thread_id}"} <= routes
