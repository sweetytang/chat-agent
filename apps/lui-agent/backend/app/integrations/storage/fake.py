from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

from .ports import ObjectMetadata


class InMemoryObjectStorage:
    def __init__(self, base_url: str = "memory://objects") -> None:
        self.base_url = base_url.rstrip("/")
        self.objects: dict[str, tuple[bytes, ObjectMetadata]] = {}

    async def put(self, data: bytes, metadata: ObjectMetadata) -> ObjectMetadata:
        if metadata.size != len(data):
            metadata = ObjectMetadata(**{**metadata.__dict__, "size": len(data)})
        self.objects[metadata.key] = (data, metadata)
        return metadata

    async def metadata(self, key: str) -> ObjectMetadata | None:
        item = self.objects.get(key)
        return item[1] if item else None

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    async def presign(self, key: str, *, owner_id: str, run_id: str, tool_call_id: str, expires_seconds: int = 300) -> str:
        item = self.objects.get(key)
        if item is None:
            raise FileNotFoundError(key)
        meta = item[1]
        if (meta.owner_id, meta.run_id, meta.tool_call_id) != (owner_id, run_id, tool_call_id):
            raise PermissionError("对象归属校验失败")
        return f"{self.base_url}/{quote(key)}?expires={expires_seconds}"

    async def cleanup_expired(self, *, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        keys = [key for key, (_, meta) in self.objects.items() if meta.expires_at <= now]
        for key in keys:
            await self.delete(key)
        return len(keys)
