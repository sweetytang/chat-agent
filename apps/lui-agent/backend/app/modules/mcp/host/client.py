"""MCP Host 的可注入连接池与工具目录适配。

协议层只依赖 ``McpClientFactory``，因此测试和部署层可以替换真实 SDK
客户端。Host 不把异常原文返回给用户，只暴露稳定的脱敏错误。
"""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from .ports import McpClientFactory, McpClientPort
from .state import McpConnectionState, McpStateMachine


@dataclass(frozen=True)
class McpToolDescriptor:
    server_id: UUID | str
    remote_name: str
    description: str
    input_schema: dict[str, Any]
    annotations: dict[str, Any]


class McpHostError(RuntimeError):
    """可安全展示的 Host 错误。"""


def _safe_error(error: BaseException) -> str:
    # 连接异常可能包含 URL、Header 或 token；统一返回稳定消息。
    if isinstance(error, BaseExceptionGroup):
        children = [item for item in error.exceptions if isinstance(item, BaseException)]
        detail = _safe_error(children[0]) if children else "子进程启动失败"
        return f"MCP 操作失败：{detail}"
    name = type(error).__name__
    if isinstance(error, (FileNotFoundError, PermissionError)):
        return f"MCP 操作失败：stdio 命令不可执行（{name}）"
    return f"MCP 操作失败（{name}）"


class McpHost:
    def __init__(self, factory: McpClientFactory) -> None:
        self.factory = factory
        self._clients: dict[str, McpClientPort] = {}
        self._contexts: dict[str, Any] = {}
        self._states: dict[str, McpStateMachine] = {}
        self._catalog: dict[str, tuple[McpToolDescriptor, ...]] = {}

    def state(self, server_id: UUID | str) -> McpConnectionState:
        return self._states.setdefault(str(server_id), McpStateMachine()).state

    def catalog(self, server_id: UUID | str) -> tuple[McpToolDescriptor, ...]:
        return self._catalog.get(str(server_id), ())

    async def connect(
        self,
        server_id: UUID | str,
        *,
        endpoint: str | None = None,
        headers: dict[str, str] | None = None,
        command: str | None = None,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> tuple[McpToolDescriptor, ...]:
        key = str(server_id)
        # 刷新和安全配置更新后的重连必须先关闭旧会话，避免连接与凭据泄漏。
        await self.disconnect(key)
        machine = self._states.setdefault(key, McpStateMachine())
        machine.transition(McpConnectionState.CONNECTING)
        context = None
        entered = False
        try:
            context = self.factory.connect(endpoint=endpoint, headers=headers or {}, command=command, args=args, env=env)
            client = await context.__aenter__()
            entered = True
            tools = await client.list_tools()
            descriptors = tuple(
                McpToolDescriptor(
                    server_id,
                    str(item.get("name", "")),
                    str(item.get("description", "")),
                    dict(item.get("inputSchema") or item.get("input_schema") or {}),
                    dict(item.get("annotations") or {}),
                )
                for item in tools
                if item.get("name")
            )
        except Exception as error:
            if entered and context is not None:
                with suppress(Exception):
                    await context.__aexit__(type(error), error, error.__traceback__)
            machine.transition(McpConnectionState.ERROR)
            raise McpHostError(_safe_error(error)) from error
        self._contexts[key] = context
        self._clients[key] = client
        self._catalog[key] = descriptors
        machine.transition(McpConnectionState.CONNECTED)
        return descriptors

    async def disconnect(self, server_id: UUID | str) -> None:
        key = str(server_id)
        context = self._contexts.pop(key, None)
        self._clients.pop(key, None)
        self._catalog.pop(key, None)
        machine = self._states.setdefault(key, McpStateMachine())
        if machine.state is not McpConnectionState.DISABLED:
            machine.transition(McpConnectionState.DISABLED)
        if context is not None:
            # 停用必须幂等；远端连接关闭失败不能把用户的 DB 开关操作变成 500。
            with suppress(Exception):
                await context.__aexit__(None, None, None)

    async def call(self, server_id: UUID | str, remote_name: str, arguments: dict[str, Any]) -> Any:
        client = self._clients.get(str(server_id))
        if client is None:
            raise McpHostError("MCP Server 未连接")
        try:
            return await client.call_tool(remote_name, arguments)
        except Exception as error:
            raise McpHostError(_safe_error(error)) from error
