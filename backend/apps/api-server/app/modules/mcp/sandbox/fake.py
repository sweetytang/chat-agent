"""测试用内存 stdio 沙箱。"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from .ports import SandboxDefinition, SandboxHandle, SandboxLimits


class FakeSandboxOrchestrator:
    def __init__(self, allowed_definitions: dict[str, SandboxDefinition] | None = None) -> None:
        self.allowed_definitions = allowed_definitions or {}
        self._queues: dict[str, asyncio.Queue[bytes | None]] = {}
        self._active: dict[str, SandboxDefinition] = {}
        self._counter = 0

    async def start(
        self, definition: SandboxDefinition, limits: SandboxLimits | None = None
    ) -> SandboxHandle:
        approved = self.allowed_definitions.get(definition.definition_id)
        if approved != definition:
            raise PermissionError("stdio definition 未获批准")
        if limits and (limits.cpu <= 0 or limits.memory_mb <= 0 or limits.pids <= 0):
            raise ValueError("沙箱资源限制必须为正数")
        self._counter += 1
        cid = f"fake-{self._counter}"
        self._active[cid] = definition
        self._queues[cid] = asyncio.Queue()
        return SandboxHandle(cid)

    async def send(self, handle: SandboxHandle, data: bytes) -> None:
        if handle.container_id not in self._active:
            raise RuntimeError("沙箱不活跃")
        await self._queues[handle.container_id].put(data)

    async def receive(self, handle: SandboxHandle) -> AsyncIterator[bytes]:
        queue = self._queues.get(handle.container_id)
        if queue is None:
            raise RuntimeError("沙箱不存在")
        while True:
            item = await queue.get()
            if item is None:
                return
            yield item

    async def health(self, handle: SandboxHandle) -> bool:
        return handle.container_id in self._active

    async def terminate(self, handle: SandboxHandle, *, force: bool = False) -> None:
        if handle.container_id in self._active:
            self._active.pop(handle.container_id)
            await self._queues[handle.container_id].put(None)

    async def cleanup_orphans(self) -> int:
        count = len(self._active)
        for cid in list(self._active):
            await self.terminate(SandboxHandle(cid), force=True)
        return count
