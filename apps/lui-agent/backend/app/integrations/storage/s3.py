"""S3/MinIO 适配器。boto3 延迟导入，未安装时返回受控错误。"""
from __future__ import annotations

from datetime import UTC, datetime

from .ports import ObjectMetadata


class StorageUnavailableError(RuntimeError):
    pass


class S3ObjectStorage:
    def __init__(self, *, bucket: str, client=None, endpoint_url: str | None = None) -> None:
        if not bucket:
            raise ValueError("bucket 不能为空")
        if client is None:
            try:
                import boto3  # type: ignore[import-not-found]
            except ImportError as exc:
                raise StorageUnavailableError("S3 适配器需要 boto3") from exc
            client = boto3.client("s3", endpoint_url=endpoint_url)
        self.client, self.bucket = client, bucket
        self._metadata: dict[str, ObjectMetadata] = {}

    async def put(self, data: bytes, metadata: ObjectMetadata) -> ObjectMetadata:
        self.client.put_object(Bucket=self.bucket, Key=metadata.key, Body=data, ContentType=metadata.content_type)
        self._metadata[metadata.key] = metadata
        return metadata

    async def metadata(self, key: str) -> ObjectMetadata | None:
        return self._metadata.get(key)

    async def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)
        self._metadata.pop(key, None)

    async def presign(self, key: str, *, owner_id: str, run_id: str, tool_call_id: str, expires_seconds: int = 300) -> str:
        meta = self._metadata.get(key)
        if meta is None:
            raise FileNotFoundError(key)
        if (meta.owner_id, meta.run_id, meta.tool_call_id) != (owner_id, run_id, tool_call_id):
            raise PermissionError("对象归属校验失败")
        return self.client.generate_presigned_url("get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires_seconds)

    async def cleanup_expired(self, *, now: datetime | None = None) -> int:
        now = now or datetime.now(UTC)
        keys = [key for key, meta in self._metadata.items() if meta.expires_at <= now]
        for key in keys:
            await self.delete(key)
        return len(keys)
