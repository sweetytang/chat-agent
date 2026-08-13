"""Narrow Docker control-plane adapter.

The application passes an approved definition and policy, never a raw Docker
create payload. A production deployment should place this adapter behind a
least-privilege sidecar or socket proxy.
"""

from typing import Any

from app.modules.mcp.sandbox.policy import SandboxPolicy, validate_policy
from app.modules.mcp.sandbox.port import SandboxHandle


class DockerSandboxProxy:
    def __init__(self, client: Any, *, approved_images: set[str], label_prefix: str = "lui-agent.mcp") -> None:
        self.client = client
        self.approved_images = approved_images
        self.label_prefix = label_prefix

    async def start(self, definition_id: str, policy: SandboxPolicy) -> SandboxHandle:
        validate_policy(policy)
        if policy.image_digest not in self.approved_images:
            raise PermissionError("stdio 镜像不在管理员批准清单中")
        labels = {f"{self.label_prefix}.managed": "true", f"{self.label_prefix}.definition": definition_id}
        container = self.client.create_container(
            image=policy.image_digest,
            command=list(policy.command),
            environment=policy.environment,
            labels=labels,
            read_only=True,
            network_mode="none",
            cap_drop=["ALL"],
            security_opt=["no-new-privileges:true"],
            mem_limit=policy.memory_bytes,
            nano_cpus=int(policy.cpu_limit * 1_000_000_000),
            pids_limit=policy.pids_limit,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
            user="65532:65532",
        )
        container_id = str(container["Id"] if isinstance(container, dict) else container.id)
        self.client.start(container_id)
        return SandboxHandle(container_id, policy)

    async def stop(self, handle: SandboxHandle) -> None:
        container = self.client.get_container(handle.container_id)
        labels = container.labels or {}
        if labels.get(f"{self.label_prefix}.managed") != "true":
            raise PermissionError("拒绝操作非 MCP 容器")
        container.remove(force=True)
