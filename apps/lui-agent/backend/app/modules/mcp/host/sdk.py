"""MCP Python SDK 的 Streamable HTTP client adapter。"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


class SdkMcpClient:
    def __init__(self, session: ClientSession) -> None:
        self.session = session

    async def list_tools(self) -> list[dict[str, Any]]:
        result = await self.session.list_tools()
        return [tool.model_dump(by_alias=True, exclude_none=True) for tool in result.tools]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        result = await self.session.call_tool(name, arguments)
        return result.model_dump(by_alias=True, exclude_none=True)


class StreamableHttpClientFactory:
    @asynccontextmanager
    async def connect(
        self, *, endpoint: str, headers: dict[str, str]
    ) -> AsyncIterator[SdkMcpClient]:
        # 禁止自动重定向；重定向目标必须重新经过 SSRF 校验后才能连接。
        async with (
            httpx2.AsyncClient(headers=headers, follow_redirects=False) as http_client,
            streamable_http_client(endpoint, http_client=http_client) as streams,
            ClientSession(*streams) as session,
        ):
            await session.initialize()
            yield SdkMcpClient(session)
