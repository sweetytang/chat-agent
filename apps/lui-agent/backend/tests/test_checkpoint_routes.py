from app.main import app
from tests.route_helpers import route_paths


def test_checkpoint_routes_are_exposed() -> None:
    routes = route_paths(app)

    assert {
        "/api/threads/{thread_id}/checkpoints",
        "/api/threads/{thread_id}/checkpoints/{checkpoint_id}/switch",
    } <= routes
