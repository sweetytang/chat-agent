"""MCP Python SDK 的 Streamable HTTP client adapter。"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import os
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.client.stdio import StdioServerParameters, stdio_client


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
        self, *, endpoint: str | None = None, headers: dict[str, str] | None = None,
        command: str | None = None, args: list[str] | None = None, env: dict[str, str] | None = None
    ) -> AsyncIterator[SdkMcpClient]:
        if command:
            runtime_env = dict(os.environ)
            runtime_env.update(env or {})
            # Node 24 的原生 fetch 默认不读取 HTTP(S)_PROXY；显式打开环境代理支持，
            # 使 npx 启动的 MCP 子进程与后端 curl 使用同一网络出口。
            if any(runtime_env.get(key) for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")):
                runtime_env.setdefault("NODE_USE_ENV_PROXY", "1")
            params = StdioServerParameters(command=command, args=args or [], env=runtime_env)
            async with stdio_client(params) as streams, ClientSession(*streams) as session:
                await session.initialize()
                yield SdkMcpClient(session)
            return
        if not endpoint:
            raise ValueError("MCP endpoint 或 stdio command 必须提供")
        # 禁止自动重定向；重定向目标必须重新经过 SSRF 校验后才能连接。
        async with (
            httpx.AsyncClient(headers=headers or {}, follow_redirects=False) as http_client,
            streamable_http_client(endpoint, http_client=http_client) as streams,
            ClientSession(*streams) as session,
        ):
            await session.initialize()
            yield SdkMcpClient(session)
