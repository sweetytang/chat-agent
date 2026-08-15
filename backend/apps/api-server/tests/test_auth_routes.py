from app.main import app
from tests.route_helpers import route_paths


def test_auth_routes_are_exposed() -> None:
    routes = route_paths(app)

    assert {
        "/api/auth/register",
        "/api/auth/token",
        "/api/auth/me",
        "/api/auth/refresh",
        "/api/auth/logout",
    } <= routes
