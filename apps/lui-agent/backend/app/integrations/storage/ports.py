"""二进制对象存储端口。"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class ObjectMetadata:
    key: str
    content_type: str
    size: int
    owner_id: str
    run_id: str
    tool_call_id: str
    expires_at: datetime


class ObjectStorage(Protocol):
    async def put(self, data: bytes, metadata: ObjectMetadata) -> ObjectMetadata: ...
    async def metadata(self, key: str) -> ObjectMetadata | None: ...
    async def delete(self, key: str) -> None: ...
    async def presign(self, key: str, *, owner_id: str, run_id: str, tool_call_id: str, expires_seconds: int = 300) -> str: ...
    async def cleanup_expired(self, *, now: datetime | None = None) -> int: ...
