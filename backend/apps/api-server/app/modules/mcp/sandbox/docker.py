"""Docker 编排策略验证器；实际 Docker 客户端由部署层注入。"""

from __future__ import annotations

from dataclasses import dataclass, field

from .ports import SandboxDefinition, SandboxLimits


@dataclass(frozen=True)
class DockerContainerConfig:
    image: str
    command: tuple[str, ...]
    labels: dict[str, str]
    network_disabled: bool = True
    read_only: bool = True
    user: str = "65532:65532"
    cap_drop: tuple[str, ...] = ("ALL",)
    tmpfs: tuple[str, ...] = ("/tmp:rw,noexec,nosuid,size=64m",)
    binds: tuple[str, ...] = ()
    docker_socket: bool = False
    limits: SandboxLimits = field(default_factory=SandboxLimits)


class DockerPolicyError(ValueError):
    pass


def build_container_config(
    definition: SandboxDefinition,
    limits: SandboxLimits | None = None,
    *,
    allowed_images: frozenset[str],
) -> DockerContainerConfig:
    if definition.image not in allowed_images:
        raise DockerPolicyError("镜像不在批准清单")
    if definition.labels.get("mcp.managed") != "true":
        raise DockerPolicyError("容器缺少 MCP 管理标签")
    chosen = limits or SandboxLimits()
    if chosen.cpu <= 0 or chosen.memory_mb <= 0 or chosen.pids <= 0:
        raise DockerPolicyError("资源限制无效")
    return DockerContainerConfig(
        definition.image, definition.command, dict(definition.labels), limits=chosen
    )
