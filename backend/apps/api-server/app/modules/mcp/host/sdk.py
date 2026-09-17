"""MCP Python SDK 的 Streamable HTTP client adapter。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import os
from typing import Any, cast

import httpx
from mcp import Client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client


class McpClientFactory:
    """MCP客户端工厂"""

    @asynccontextmanager
    async def connect(
        self,
        *,
        endpoint: str | None = None,
        headers: dict[str, str] | None = None,
        command: str | None = None,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> AsyncIterator[Client]:
        if command is None and endpoint is None:
            raise ValueError("MCP endpoint 或 stdio command 必须提供")

        # 1. 本地 stdio 进程传输通道
        if command:
            runtime_env = dict(os.environ)
            runtime_env.update(env or {})
            if any(runtime_env.get(key) for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")):
                runtime_env.setdefault("NODE_USE_ENV_PROXY", "1")

            params = StdioServerParameters(command=command, args=args or [], env=runtime_env)
            async with Client(stdio_client(params)) as client:
                yield client
            return

        # 2. 远端 Streamable HTTP / SSE 传输通道
        http_timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=30.0)
        async with (
            httpx.AsyncClient(
                headers=headers or {},
                follow_redirects=False,
                timeout=http_timeout,
            ) as http_client,
            Client(streamable_http_client(endpoint, http_client=cast(Any, http_client))) as client,
        ):
            yield client
