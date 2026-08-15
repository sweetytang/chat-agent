from app.main import app
from tests.route_helpers import route_paths


def test_interrupt_routes_are_exposed() -> None:
    routes = route_paths(app)

    assert {
        "/api/interrupts",
        "/api/interrupts/{request_id}/resolve",
        "/api/interrupts/{request_id}/resume",
        "/api/threads/{thread_id}/interrupts/pending",
    } <= routes
