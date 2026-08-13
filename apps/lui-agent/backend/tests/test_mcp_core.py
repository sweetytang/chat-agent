import pytest

from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.naming import TOOL_NAME_PATTERN, ToolNameMapper
from app.modules.mcp.network import NetworkPolicyError, validate_public_http_url
from app.modules.mcp.host.state import McpConnectionState, McpStateMachine


def test_tool_mapper_is_stable_and_bidirectional() -> None:
    mapper = ToolNameMapper()
    identity = mapper.register("srv_123", "create issue/危险")
    assert TOOL_NAME_PATTERN.fullmatch(identity.internal_name)
    assert len(identity.internal_name) <= 64
    assert mapper.register("srv_123", "create issue/危险") == identity
    assert mapper.resolve_internal(identity.internal_name) == identity
    assert mapper.resolve_remote("srv_123", "create issue/危险") == identity


def test_tool_mapper_namespaces_same_remote_names() -> None:
    mapper = ToolNameMapper()
    left = mapper.register("left", "search")
    right = mapper.register("right", "search")
    assert left.internal_name != right.internal_name


def test_credential_crypto_round_trip_and_invalid_key() -> None:
    with pytest.raises(ValueError):
        CredentialCrypto(b"short")
    crypto = CredentialCrypto(b"0" * 32)
    encrypted = crypto.encrypt("Bearer secret")
    assert encrypted.startswith("v1:")
    assert "secret" not in encrypted
    assert crypto.decrypt(encrypted) == "Bearer secret"
    with pytest.raises(ValueError):
        crypto.decrypt("invalid")


def test_network_policy_rejects_private_and_non_https(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("127.0.0.1", 443))],
    )
    with pytest.raises(NetworkPolicyError):
        validate_public_http_url("https://example.test/mcp")
    with pytest.raises(NetworkPolicyError):
        validate_public_http_url("http://example.test/mcp")


def test_network_policy_accepts_public_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    assert validate_public_http_url("https://example.test/mcp") == "https://example.test/mcp"


def test_mcp_state_machine_rejects_invalid_transition() -> None:
    machine = McpStateMachine()
    machine.transition(McpConnectionState.CONNECTING)
    machine.transition(McpConnectionState.CONNECTED)
    machine.transition(McpConnectionState.DEGRADED)
    machine.transition(McpConnectionState.ERROR)
    with pytest.raises(ValueError):
        machine.transition(McpConnectionState.CONNECTED)
