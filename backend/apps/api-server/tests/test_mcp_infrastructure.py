from datetime import UTC, datetime, timedelta

import pytest

from app.integrations.storage import InMemoryObjectStorage, ObjectMetadata
from app.modules.mcp.sandbox import (
    FakeSandboxOrchestrator,
    SandboxDefinition,
    build_container_config,
)


@pytest.mark.asyncio
async def test_fake_sandbox_requires_approved_definition_and_cleans() -> None:
    definition = SandboxDefinition("approved", "mcp:1", labels={"mcp.managed": "true"})
    orchestrator = FakeSandboxOrchestrator({definition.definition_id: definition})
    with pytest.raises(PermissionError):
        await orchestrator.start(SandboxDefinition("other", "unsafe"))
    handle = await orchestrator.start(definition)
    assert await orchestrator.health(handle)
    assert await orchestrator.cleanup_orphans() == 1
    assert not await orchestrator.health(handle)


def test_docker_policy_defaults_are_restricted() -> None:
    definition = SandboxDefinition("approved", "mcp:1", labels={"mcp.managed": "true"})
    config = build_container_config(definition, allowed_images=frozenset({"mcp:1"}))
    assert config.network_disabled and config.read_only and config.user != "0"
    assert config.cap_drop == ("ALL",) and not config.binds and not config.docker_socket


@pytest.mark.asyncio
async def test_storage_ownership_and_idempotent_cleanup() -> None:
    storage = InMemoryObjectStorage()
    metadata = ObjectMetadata(
        "result.bin",
        "application/octet-stream",
        1,
        "u",
        "r",
        "call",
        datetime.now(UTC) - timedelta(seconds=1),
    )
    await storage.put(b"x", metadata)
    with pytest.raises(PermissionError):
        await storage.presign("result.bin", owner_id="other", run_id="r", tool_call_id="call")
    assert await storage.cleanup_expired() == 1
    assert await storage.cleanup_expired() == 0
