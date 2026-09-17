"""从 user_mcp_servers 表动态加载用户启用的 MCP 工具快照，支持降级与警告通知。"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UserMcpServer
from app.modules.mcp.host.client import McpHost
from app.modules.mcp.host.state import McpConnectionState
from app.modules.mcp.schemas import ToolIdentity

from .tools import McpToolSnapshot

logger = logging.getLogger(__name__)


def _clean_mcp_arguments(
    arguments: dict[str, Any], input_schema: dict[str, Any] | None = None
) -> dict[str, Any]:
    """参数清洁工（Sanitizer）：
    它在把参数传给真实的 MCP Server 之前，
    把大模型经常“自作聪明”塞进来的 None、空字符串 "" 以及非必填数字字段被误补的 0 剔除掉，
    让发给 MCP 工具的入参恢复成最纯净的状态。
    """
    properties = (input_schema or {}).get("properties", {})
    required = set((input_schema or {}).get("required", []))
    cleaned: dict[str, Any] = {}
    for key, value in arguments.items():
        if value is None or value == "":
            continue
        property_schema = properties.get(key, {}) if isinstance(properties, dict) else {}
        if (
            key not in required
            and value == 0
            and not isinstance(value, bool)
            and property_schema.get("type") in {"number", "integer"}
        ):
            continue
        cleaned[key] = value
    return cleaned


def _project_input_schema(schema: Any) -> tuple[dict[str, Any], str | None]:
    """仅保留无歧义 JSON Schema，无法投影时返回原因。"""

    if not isinstance(schema, dict):
        return {}, "inputSchema 不是对象"
    schema_type = schema.get("type", "object")
    if schema_type != "object":
        return {}, "工具参数必须是 object schema"
    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        return {}, "properties 不是对象"
    projected: dict[str, Any] = {"type": "object", "properties": {}}
    # GitHub 等成熟 MCP 会用 $ref/anyOf 表达 nullable 或复合参数。
    for name, value in properties.items():
        if not isinstance(name, str) or not isinstance(value, dict):
            return {}, "参数 schema 不可兼容"
        # 不把未知关键词原样交给 Provider，只保留可安全理解的约束；
        item = {
            key: value[key]
            for key in ("type", "description", "enum", "items", "default")
            if key in value
        }
        # 缺少顶层 type 并不等于不兼容。
        if "type" not in item:
            variants = value.get("anyOf") or value.get("oneOf")
            if isinstance(variants, list):
                types = [entry.get("type") for entry in variants if isinstance(entry, dict)]
                types = [entry for entry in types if isinstance(entry, str)]
                if types:
                    item["type"] = types[0] if len(set(types)) == 1 else "string"
            elif "$ref" in value:
                item["type"] = "object"
        if "type" not in item:
            item["type"] = "string"  # 实在不行就强制兜底成 string，防止大模型报 400
        projected["properties"][name] = item
    if isinstance(schema.get("required"), list):
        projected["required"] = [item for item in schema["required"] if item in properties]
    return projected, None


async def load_server_snapshots(server: UserMcpServer, host: McpHost) -> tuple[McpToolSnapshot]:
    """动态拉取用户启用的制定 MCP 服务的工具清单"""
    snapshots: list[McpToolSnapshot] = []
    try:
        descriptors = host.catalog(server.id)
        # 未连接mcp 重新连接
        if host.state(server.id) is not McpConnectionState.CONNECTED or not descriptors:
            descriptors = await host.get_tool_descriptors(
                server.id,
                endpoint=server.endpoint,
                headers=server.request_headers or {},
                command=server.command,
                args=server.args or [],
                env=server.process_env or {},
            )

        tool_rules = (server.tool_rules or {}).get("tools", {})
        for tool in descriptors:
            remote_name = tool.remote_name
            rule = tool_rules.get(remote_name, {})
            # 如果明确配置了 enabled=False，则排除
            if isinstance(rule, dict) and rule.get("enabled") is False:
                continue

            projected_schema, incompatibility = _project_input_schema(tool.input_schema or {})
            if incompatibility is not None:
                continue

            internal_name = f"mcp__{server.name}__{remote_name}"
            identity = ToolIdentity(str(server.id), remote_name, internal_name)
            schema_value = dict(projected_schema)

            async def caller(
                ident: ToolIdentity,
                arguments: dict[str, Any],
                *,
                sid: UUID = server.id,
                schema: dict[str, Any] | None = None,
                schema_items: tuple[tuple[str, Any], ...] = tuple(schema_value.items()),
            ) -> Any:
                return await host.call(
                    sid,
                    ident.remote_name,
                    _clean_mcp_arguments(arguments, schema or dict(schema_items)),
                )

            require_approval = rule.get("require_approval", True)
            snapshots.append(
                McpToolSnapshot(
                    identity=identity,
                    description=tool.description or remote_name,
                    input_schema=projected_schema,
                    caller=caller,
                    enabled=True,
                    require_approval=require_approval,
                    security_version=1,
                    server_name=server.name,
                )
            )
    except Exception as exc:
        err_msg = f"连接 MCP 服务 '{server.name}' 失败: {exc}"
        logger.warning(err_msg)

    return tuple(snapshots)


async def load_mcp_snapshots(
    session: AsyncSession,
    user_id: UUID,
    host: McpHost,
) -> tuple[McpToolSnapshot]:
    """动态拉取用户启用的所有 MCP 服务的工具清单。

    - 优雅降级：单个服务连接或列举失败时记录日志并触发 on_warning，不中断整体流程。
    - 权限过滤：依据 server.tool_rules 过滤启用的工具与审批设置。
    """
    query = (
        select(UserMcpServer)
        .where(UserMcpServer.user_id == user_id, UserMcpServer.enabled.is_(True))
        .order_by(UserMcpServer.created_at.asc())
    )
    servers = (await session.execute(query)).scalars().all()
    snapshots = []
    for server in servers:
        server_tools = await load_server_snapshots(server, host)
        snapshots.extend(server_tools)

    return tuple(snapshots)
