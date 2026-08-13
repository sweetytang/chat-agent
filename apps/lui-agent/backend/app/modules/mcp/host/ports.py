from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol


class McpClientPort(Protocol):
    async def list_tools(self) -> list[dict[str, Any]]: ...

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any: ...


class McpClientFactory(Protocol):
    def connect(self, *, endpoint: str | None = None, headers: dict[str, str] | None = None, command: str | None = None, args: list[str] | None = None, env: dict[str, str] | None = None) -> AbstractAsyncContextManager[McpClientPort]: ...
