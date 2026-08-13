import pytest

from app.modules.mcp.sandbox.docker_proxy import DockerSandboxProxy
from app.modules.mcp.sandbox.policy import SandboxPolicy


class FakeContainer:
    id = "container-1"
    labels = {"lui-agent.mcp.managed": "true"}
    removed = False

    def remove(self, *, force: bool) -> None:
        self.removed = force


class FakeDocker:
    def __init__(self) -> None:
        self.created = None
        self.container = FakeContainer()

    def create_container(self, **kwargs):
        self.created = kwargs
        return {"Id": "container-1"}

    def start(self, container_id: str) -> None:
        assert container_id == "container-1"

    def get_container(self, container_id: str):
        assert container_id == "container-1"
        return self.container


@pytest.mark.asyncio
async def test_docker_proxy_applies_restricted_config() -> None:
    policy = SandboxPolicy("sha256:" + "a" * 64, ("server",))
    docker = FakeDocker()
    handle = await DockerSandboxProxy(docker, approved_images={policy.image_digest}).start("def-1", policy)
    assert docker.created["read_only"] is True
    assert docker.created["network_mode"] == "none"
    assert docker.created["cap_drop"] == ["ALL"]
    await DockerSandboxProxy(docker, approved_images={policy.image_digest}).stop(handle)
    assert docker.container.removed is True


@pytest.mark.asyncio
async def test_docker_proxy_rejects_unapproved_image() -> None:
    policy = SandboxPolicy("sha256:" + "a" * 64, ("server",))
    with pytest.raises(PermissionError):
        await DockerSandboxProxy(FakeDocker(), approved_images=set()).start("def-1", policy)
