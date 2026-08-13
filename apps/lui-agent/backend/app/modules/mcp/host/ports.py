from collections.abc import AsyncContextManager
from typing import Any, Protocol


class McpClientPort(Protocol):
    async def list_tools(self) -> list[dict[str, Any]]: ...

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any: ...


class McpClientFactory(Protocol):
    def connect(self, *, endpoint: str, headers: dict[str, str]) -> AsyncContextManager[McpClientPort]: ...
