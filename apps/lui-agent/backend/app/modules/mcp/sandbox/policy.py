from dataclasses import dataclass, field


class SandboxPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class SandboxPolicy:
    image_digest: str
    command: tuple[str, ...]
    environment: dict[str, str] = field(default_factory=dict)
    network: str = "none"
    mounts: tuple[str, ...] = ()
    memory_bytes: int = 256 * 1024 * 1024
    cpu_limit: float = 1.0
    pids_limit: int = 64
    timeout_seconds: int = 300


def validate_policy(policy: SandboxPolicy) -> None:
    if not policy.image_digest.startswith("sha256:"):
        raise SandboxPolicyError("stdio 镜像必须使用 sha256 digest")
    if not policy.command or any(not item or item.startswith("/") for item in policy.command):
        raise SandboxPolicyError("stdio command 必须来自批准的容器内部命令")
    if policy.network != "none":
        raise SandboxPolicyError("stdio 默认只允许无网络策略")
    if policy.mounts:
        raise SandboxPolicyError("stdio 默认禁止任意挂载")
    if policy.memory_bytes <= 0 or policy.cpu_limit <= 0 or policy.pids_limit <= 0:
        raise SandboxPolicyError("stdio 资源限制必须为正数")
    if policy.timeout_seconds <= 0:
        raise SandboxPolicyError("stdio 运行时限必须为正数")
