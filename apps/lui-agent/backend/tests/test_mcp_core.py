import pytest

from app.modules.mcp.agent.results import normalize_tool_result
from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.host import McpHost, McpHostError, project_input_schema
from app.modules.mcp.host.state import McpConnectionState, McpStateMachine
from app.modules.mcp.naming import TOOL_NAME_PATTERN, ToolNameMapper
from app.modules.mcp.network import NetworkPolicyError, validate_public_http_url


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


def test_state_machine_is_idempotent() -> None:
    machine = McpStateMachine()
    assert machine.transition(McpConnectionState.DISABLED) is McpConnectionState.DISABLED


def test_schema_projection_rejects_unsupported_shapes() -> None:
    projected, error = project_input_schema({"type": "array"})
    assert projected == {} and error
    projected, error = project_input_schema(
        {"type": "object", "properties": {"q": {"type": "string"}}}
    )
    assert error is None and projected["properties"]["q"]["type"] == "string"


def test_binary_result_is_not_embedded_without_object_storage() -> None:
    result = normalize_tool_result(
        {"content": [{"type": "image", "data": "sensitive-base64", "mimeType": "image/png"}]}
    )

    assert "sensitive-base64" not in str(result)
    assert result["content"][0]["error"] == "MCP 二进制对象存储未配置"


@pytest.mark.asyncio
async def test_host_discovers_routes_and_sanitizes_errors() -> None:
    exits = 0

    class Context:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            nonlocal exits
            exits += 1
            return None

        async def list_tools(self):
            return [{"name": "search", "inputSchema": {"type": "object"}}]

        async def call_tool(self, name, arguments):
            assert name == "search"
            return arguments

    class Factory:
        def connect(self, **_kwargs):
            return Context()

    host = McpHost(Factory())
    tools = await host.connect("srv", endpoint="https://example.test/mcp")
    assert tools[0].remote_name == "search"
    assert await host.call("srv", "search", {"q": "x"}) == {"q": "x"}
    await host.connect("srv", endpoint="https://example.test/mcp")
    assert exits == 1
    await host.disconnect("srv")
    assert exits == 2
    with pytest.raises(McpHostError, match="未连接"):
        await host.call("srv", "search", {})


@pytest.mark.asyncio
async def test_host_closes_failed_context() -> None:
    exits = 0

    class Context:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            nonlocal exits
            exits += 1

        async def list_tools(self):
            raise RuntimeError("Bearer secret")

    class Factory:
        def connect(self, **_kwargs):
            return Context()

    with pytest.raises(McpHostError, match="RuntimeError"):
        await McpHost(Factory()).connect("srv", endpoint="https://example.test/mcp")
    assert exits == 1
