"""从数据库用户偏好构建 run 级 MCP 工具快照。"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    McpServerDefinition,
    McpServerStatus,
    McpTool,
    McpUserServer,
    McpUserTool,
)
from app.modules.mcp.host.client import McpHost
from app.modules.mcp.host.schema import project_input_schema
from app.modules.mcp.host.state import McpConnectionState
from app.modules.mcp.naming import ToolIdentity

from .tools import McpToolSnapshot


def clean_mcp_arguments(
    arguments: dict[str, Any], input_schema: dict[str, Any] | None = None
) -> dict[str, Any]:
    """去掉模型为可选参数生成的空占位值。

    部分模型会把可选 number 参数补成 ``0``。GitHub MCP 的 milestone
    编号从 1 开始，这种占位值会直接触发 GitHub API 的 422 Validation Failed。
    仅对 schema 中声明为可选数字字段的 0 做清理，避免影响必填字段或合法的
    布尔值 false。
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


async def load_mcp_snapshots(
    session: AsyncSession,
    user_id: UUID,
    host: McpHost,
    decode_credentials: Callable[[str | None], dict[str, str]] | None = None,
) -> list[McpToolSnapshot]:
    query = (
        select(McpTool, McpServerDefinition)
        .join(McpServerDefinition, McpServerDefinition.id == McpTool.server_id)
        .join(McpUserServer, McpUserServer.server_id == McpServerDefinition.id)
        .join(McpUserTool, McpUserTool.tool_id == McpTool.id)
        .where(
            McpUserServer.user_id == user_id,
            McpUserServer.enabled.is_(True),
            McpUserTool.user_id == user_id,
            McpUserTool.enabled.is_(True),
            McpServerDefinition.status != McpServerStatus.DISABLED,
            McpTool.is_present.is_(True),
            McpTool.compatibility == "COMPATIBLE",
            McpServerDefinition.deleted_at.is_(None),
        )
    )
    rows = (await session.execute(query)).all()
    snapshots: list[McpToolSnapshot] = []
    connected_servers: set[UUID] = set()
    for tool, server in rows:
        if server.id not in connected_servers:
            if host.state(server.id) is not McpConnectionState.CONNECTED:
                approved = server.approved_config or {}
                if not server.endpoint and not approved.get("command"):
                    continue
                await host.connect(
                    server.id,
                    endpoint=server.endpoint,
                    headers=decode_credentials(server.encrypted_credentials)
                    if decode_credentials is not None
                    else {},
                    command=approved.get("command"),
                    args=approved.get("args"),
                    env=approved.get("env"),
                )
            connected_servers.add(server.id)
        projected_schema, incompatibility = project_input_schema(tool.input_schema)
        if incompatibility is not None:
            continue
        identity = ToolIdentity(str(server.id), tool.remote_name, tool.internal_name)
        schema_value = dict(projected_schema)

        async def caller(
            identity: ToolIdentity,
            arguments: dict[str, Any],
            *,
            sid: UUID = server.id,
            schema: dict[str, Any] | None = None,
            schema_items: tuple[tuple[str, Any], ...] = tuple(schema_value.items()),
        ) -> Any:
            # GitHub issue_write 的可选 type 在未启用 Issue Types 时必须省略，
            # 传空字符串会被远端校验为“parameter type must not be empty”。
            return await host.call(
                sid,
                identity.remote_name,
                clean_mcp_arguments(arguments, schema or dict(schema_items)),
            )

        snapshots.append(
            McpToolSnapshot(
                identity,
                tool.description or tool.remote_name,
                projected_schema,
                caller,
                security_version=server.security_version,
                server_name=server.name,
            )
        )
    return snapshots
