"""stdio MCP 沙箱的应用端口与安全策略。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class SandboxDefinition:
    definition_id: str
    image: str
    command: tuple[str, ...] = ()
    labels: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class SandboxLimits:
    cpu: float = 1.0
    memory_mb: int = 512
    pids: int = 64
    timeout_seconds: int = 120


@dataclass(frozen=True)
class SandboxHandle:
    container_id: str


class StdioSandboxOrchestrator(Protocol):
    async def start(
        self, definition: SandboxDefinition, limits: SandboxLimits | None = None
    ) -> SandboxHandle: ...
    async def send(self, handle: SandboxHandle, data: bytes) -> None: ...
    def receive(self, handle: SandboxHandle) -> AsyncIterator[bytes]: ...
    async def health(self, handle: SandboxHandle) -> bool: ...
    async def terminate(self, handle: SandboxHandle, *, force: bool = False) -> None: ...
    async def cleanup_orphans(self) -> int: ...
