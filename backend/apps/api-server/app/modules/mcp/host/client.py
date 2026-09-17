"""MCP Host 的可注入连接池与工具目录适配。

协议层只依赖 ``McpClientFactory``，因此测试和部署层可以替换真实 SDK
客户端。Host 不把异常原文返回给用户，只暴露稳定的脱敏错误。
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any
from uuid import UUID

from .sdk import McpClientFactory
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
        except TypeError, ValueError:
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
        except TypeError, ValueError:
            return None
    return None


class McpHost:
    """管理MCP客户端"""

    def __init__(self, factory: McpClientFactory) -> None:
        self.factory = factory
        self._states: dict[str, McpStateMachine] = {}  # mcp状态
        self._catalog: dict[str, tuple[McpToolDescriptor, ...]] = {}  # mcp工具列表
        self._agent_ids: dict[str, str] = {}
        self._configs: dict[str, dict[str, Any]] = {}

    def state(self, server_id: UUID | str) -> McpConnectionState:
        return self._states.setdefault(str(server_id), McpStateMachine()).state

    def catalog(self, server_id: UUID | str) -> tuple[McpToolDescriptor, ...]:
        return self._catalog.get(str(server_id), ())

    async def get_tool_descriptors(
        self,
        server_id: UUID | str,
        *,
        endpoint: str | None = None,
        headers: dict[str, str] | None = None,
        command: str | None = None,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> tuple[McpToolDescriptor]:
        server_id = str(server_id)
        config = {
            "endpoint": endpoint,
            "headers": headers or {},
            "command": command,
            "args": args,
            "env": env,
        }
        await self.disconnect(server_id)
        machine = self._states.setdefault(server_id, McpStateMachine())

        try:
            machine.transition(McpConnectionState.CONNECTING)
            async with self.factory.connect(
                endpoint=endpoint,
                headers=headers,
                command=command,
                args=args,
                env=env,
            ) as client:
                raw_tools = (await client.list_tools()).tools
                descriptors = tuple(
                    McpToolDescriptor(
                        server_id,
                        tool.name,
                        tool.description or "",
                        tool.input_schema if isinstance(tool.input_schema, dict) else {},
                        tool.annotations.model_dump() if tool.annotations else {},
                    )
                    for tool in raw_tools
                    if tool.name
                )
                self._catalog[server_id] = descriptors
                self._configs[server_id] = config
                machine.transition(McpConnectionState.CONNECTED)
                return descriptors
        except Exception as error:
            machine.transition(McpConnectionState.ERROR)
            raise McpHostError(_safe_error(error)) from error

    async def disconnect(self, server_id: UUID | str) -> None:
        server_id = str(server_id)
        self._catalog.pop(server_id, None)
        machine = self._states.setdefault(server_id, McpStateMachine())
        machine.transition(McpConnectionState.DISABLED)

    async def call(self, server_id: UUID | str, remote_name: str, arguments: dict[str, Any]) -> Any:
        server_id = str(server_id)
        if server_id not in self._configs:
            raise McpHostError("MCP Server 未连接")
        call_arguments = dict(arguments)
        # 有些特殊的 MCP Server（比如多智能体代理服务、支持 Session 的代码解释器或带上下文的 MCP 服务）：
        # 1.第一次调用工具（比如 create_agent 或 init_session）时，服务端会在返回的内容里夹带一个 agent_id: "agent-123456"；
        # 2.服务端要求后续调用这个 Server 的其它工具时，入参必须带上这个 agent_id 才能定位到同一个会话；
        # 3.但是前端大模型（LLM）在发起下一次 tool_call 时，不一定会每次都乖乖在 arguments 里把 agent_id 原样传回来。
        # 4.所以代码在这里做了一层会话自动回填机制（Sticky Session / Context Injection）：
        #       1）MCP Host 负责把这个 Server 产生的 agent_id 记住；
        #       2）下次同一个 Server 的任何工具被调用时，如果参数里没传，自动把它补进去，保证多轮交互上下文不丢失。
        if "agent_id" not in call_arguments and server_id in self._agent_ids:
            call_arguments["agent_id"] = self._agent_ids[server_id]

        for attempt in range(2):
            try:
                # MCP SDK 的 AnyIO 上下文不能跨 StreamingResponse/审核请求复用。
                # 每次工具调用建立并关闭独立会话，避免 cancel scope 跨任务清理
                async with self.factory.connect(**self._configs[server_id]) as client:
                    # 2. 调用工具后，从工具返回的结果里递归查找有没有返回 agent_id / agentId
                    result = await client.call_tool(remote_name, call_arguments)
                    agent_id = _find_agent_id(result)
                    if agent_id:
                        self._agent_ids[server_id] = agent_id
                    # 核心修复：如果是 Pydantic 模型，转成可 JSON 序列化的 dict
                    if hasattr(result, "model_dump"):
                        return result.model_dump(by_alias=True, exclude_none=True)
                    return result
            except Exception as error:
                if attempt == 0 and "connection closed" in str(error).lower():
                    continue
                raise McpHostError(_safe_error(error)) from error

        raise McpHostError("MCP 工具调用失败")
