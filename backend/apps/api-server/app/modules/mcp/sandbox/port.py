from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

from app.modules.mcp.sandbox.policy import SandboxPolicy


@dataclass(frozen=True)
class SandboxHandle:
    container_id: str
    policy: SandboxPolicy


class StdioSandboxOrchestrator(Protocol):
    async def start(self, definition_id: str, policy: SandboxPolicy) -> SandboxHandle: ...

    async def stop(self, handle: SandboxHandle) -> None: ...

    async def stdin(self, handle: SandboxHandle, data: bytes) -> None: ...

    async def stdout(self, handle: SandboxHandle) -> AsyncIterator[bytes]: ...
