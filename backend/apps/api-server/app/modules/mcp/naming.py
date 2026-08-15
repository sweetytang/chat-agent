"""Stable, provider-safe names for dynamically discovered MCP tools."""

from dataclasses import dataclass
import hashlib
import re

TOOL_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]{0,63}$")


def _slug(value: str, fallback: str) -> str:
    result = re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_-")
    if not result:
        result = fallback
    if not (result[0].isalpha() or result[0] == "_"):
        result = f"_{result}"
    return result


@dataclass(frozen=True)
class ToolIdentity:
    server_id: str
    remote_name: str
    internal_name: str


class ToolNameMapper:
    """Owns both directions of the model-name to MCP-name mapping."""

    def __init__(self) -> None:
        self._by_internal: dict[str, ToolIdentity] = {}
        self._by_remote: dict[tuple[str, str], ToolIdentity] = {}

    def register(self, server_id: str, remote_name: str) -> ToolIdentity:
        key = (server_id, remote_name)
        existing = self._by_remote.get(key)
        if existing is not None:
            return existing
        server_slug = _slug(server_id, "server")
        tool_slug = _slug(remote_name, "tool")
        digest = hashlib.sha256(f"{server_id}\0{remote_name}".encode()).hexdigest()[:10]
        prefix = f"mcp__{server_slug}__"
        suffix = f"_{digest}"
        available = 64 - len(prefix) - len(suffix)
        internal_name = f"{prefix}{tool_slug[: max(1, available)]}{suffix}"
        if not TOOL_NAME_PATTERN.fullmatch(internal_name):
            raise ValueError("生成的 MCP 工具名不符合模型约束")
        identity = ToolIdentity(server_id, remote_name, internal_name)
        collision = self._by_internal.get(internal_name)
        if collision is not None and collision != identity:
            raise ValueError("MCP 工具内部名称发生冲突")
        self._by_internal[internal_name] = identity
        self._by_remote[key] = identity
        return identity

    def resolve_internal(self, internal_name: str) -> ToolIdentity | None:
        return self._by_internal.get(internal_name)

    def resolve_remote(self, server_id: str, remote_name: str) -> ToolIdentity | None:
        return self._by_remote.get((server_id, remote_name))

    def __len__(self) -> int:
        return len(self._by_internal)
