"""MCP Host 的可注入连接池与工具目录适配。

协议层只依赖 ``McpClientFactory``，因此测试和部署层可以替换真实 SDK
客户端。Host 不把异常原文返回给用户，只暴露稳定的脱敏错误。
"""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
import json
import re
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
    # 连接异常可能包含 URL、Header 或 token；只保留限长、脱敏后的远端诊断信息。
    if isinstance(error, BaseExceptionGroup):
        children = [item for item in error.exceptions if isinstance(item, BaseException)]
        detail = _safe_error(children[0]) if children else "子进程启动失败"
        return f"MCP 操作失败：{detail}"
    name = type(error).__name__
    if isinstance(error, (FileNotFoundError, PermissionError)):
        return f"MCP 操作失败：stdio 命令不可执行（{name}）"
    detail = str(error).strip()
    detail = re.sub(r"Bearer\s+[^\s,;]+", "Bearer <redacted>", detail, flags=re.IGNORECASE)
    detail = re.sub(r"https?://[^\s,;]+", "<url>", detail)
    if detail and detail != name:
        return f"MCP 操作失败（{name}）：{detail[:300]}"
    return f"MCP 操作失败（{name}）"


def _find_agent_id(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("agent_id", "agentId"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
        for item in value.values():
            found = _find_agent_id(item)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_agent_id(item)
            if found:
                return found
    elif isinstance(value, str):
        try:
            decoded = json.loads(value)
        except (TypeError, ValueError):
            decoded = None
        if decoded is not None:
            found = _find_agent_id(decoded)
            if found:
                return found
        match = re.search(r'"(?:agent_id|agentId)"\s*:\s*"([^"]+)"', value)
        if match:
            return match.group(1)
    elif hasattr(value, "model_dump"):
        try:
            return _find_agent_id(value.model_dump(by_alias=True, exclude_none=True))
        except (TypeError, ValueError):
            return None
    return None


class McpHost:
    def __init__(self, factory: McpClientFactory) -> None:
        self.factory = factory
        self._clients: dict[str, McpClientPort] = {}
        self._contexts: dict[str, Any] = {}
        self._states: dict[str, McpStateMachine] = {}
        self._catalog: dict[str, tuple[McpToolDescriptor, ...]] = {}
        self._agent_ids: dict[str, str] = {}
        self._configs: dict[str, dict[str, Any]] = {}

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
        config = {
            "endpoint": endpoint,
            "headers": headers or {},
            "command": command,
            "args": args,
            "env": env,
        }
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
        self._configs[key] = config
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
        key = str(server_id)
        if key not in self._configs:
            raise McpHostError("MCP Server 未连接")
        call_arguments = dict(arguments)
        if "agent_id" not in call_arguments and key in self._agent_ids:
            call_arguments["agent_id"] = self._agent_ids[key]
        # MCP SDK 的 AnyIO 上下文不能跨 StreamingResponse/审核请求复用。
        # 每次工具调用建立并关闭独立会话，避免 cancel scope 跨任务清理。
        if key in self._contexts:
            await self.disconnect(key)
        config = self._configs[key]
        for attempt in range(2):
            context = self.factory.connect(**config)
            entered = False
            try:
                client = await context.__aenter__()
                entered = True
                result = await client.call_tool(remote_name, call_arguments)
                agent_id = _find_agent_id(result)
                if agent_id:
                    self._agent_ids[key] = agent_id
                return result
            except Exception as error:
                if attempt == 0 and "connection closed" in str(error).lower():
                    continue
                raise McpHostError(_safe_error(error)) from error
            finally:
                if entered:
                    with suppress(Exception):
                        await context.__aexit__(None, None, None)
        raise McpHostError("MCP 工具调用失败")
