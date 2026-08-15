from datetime import UTC, datetime
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
from app.modules.mcp.host.client import McpHost, McpHostError, McpToolDescriptor
from app.modules.mcp.host.schema import project_input_schema
from app.modules.mcp.naming import ToolNameMapper


class McpRefreshError(RuntimeError):
    """可安全返回给当前用户的刷新错误。"""


async def refresh_server_catalog(
    session: AsyncSession,
    host: McpHost,
    server: McpServerDefinition,
    user_id: UUID,
    *,
    headers: dict[str, str] | None = None,
) -> None:
    binding = await _get_binding(session, user_id, server.id)
    if not server.endpoint and server.transport.value != "STDIO":
        raise McpRefreshError("MCP Server 缺少连接地址")

    server.status = McpServerStatus.CONNECTING
    binding.last_error = None
    try:
        approved = server.approved_config or {}
        if server.transport.value == "STDIO":
            descriptors = await host.connect(
                server.id,
                endpoint=server.endpoint,
                headers=headers or {},
                command=approved.get("command"),
                args=approved.get("args"),
                env=approved.get("env"),
            )
        else:
            descriptors = await host.connect(
                server.id, endpoint=server.endpoint, headers=headers or {}
            )
        await _sync_catalog(session, server, descriptors)
        await ensure_user_tool_bindings(session, user_id, server.id)
    except McpHostError as error:
        server.status = McpServerStatus.ERROR
        binding.last_error = str(error)
        await session.commit()
        raise McpRefreshError(str(error)) from error

    server.status = McpServerStatus.CONNECTED
    binding.last_connected_at = datetime.now(UTC)
    binding.last_error = None
    await session.commit()


async def _get_binding(session: AsyncSession, user_id: UUID, server_id: UUID) -> McpUserServer:
    binding = await session.scalar(
        select(McpUserServer).where(
            McpUserServer.user_id == user_id, McpUserServer.server_id == server_id
        )
    )
    if binding is None:
        binding = McpUserServer(user_id=user_id, server_id=server_id, enabled=False)
        session.add(binding)
    return binding


async def _sync_catalog(
    session: AsyncSession,
    server: McpServerDefinition,
    descriptors: tuple[McpToolDescriptor, ...],
) -> None:
    existing = list(
        (await session.scalars(select(McpTool).where(McpTool.server_id == server.id))).all()
    )
    by_remote_name = {tool.remote_name: tool for tool in existing}
    discovered_names: set[str] = set()
    mapper = ToolNameMapper()

    for descriptor in descriptors:
        discovered_names.add(descriptor.remote_name)
        _, incompatibility = project_input_schema(descriptor.input_schema)
        tool = by_remote_name.get(descriptor.remote_name)
        if tool is None:
            identity = mapper.register(str(server.id), descriptor.remote_name)
            tool = McpTool(
                server_id=server.id,
                remote_name=descriptor.remote_name,
                internal_name=identity.internal_name,
            )
            session.add(tool)
        tool.description = descriptor.description
        # 原始 Schema 是执行前校验的权威来源；投影仅用于判断模型兼容性。
        tool.input_schema = descriptor.input_schema
        tool.annotations = descriptor.annotations
        tool.compatibility = "INCOMPATIBLE" if incompatibility else "COMPATIBLE"
        tool.is_present = True

        # 首次发现的工具默认关闭；如果该用户已有偏好则保留其选择。
        # 这样 Server 开关只负责连接/发现，工具仍由 UI 的下级开关明确启用。
        # 绑定创建在 refresh 的用户上下文内完成，避免 Agent 查询因缺行而静默丢工具。

    for tool in existing:
        if tool.remote_name not in discovered_names:
            tool.is_present = False


async def ensure_user_tool_bindings(
    session: AsyncSession,
    user_id: UUID,
    server_id: UUID,
) -> None:
    """为 catalog 中缺失的用户偏好创建关闭状态绑定。"""

    tools = (await session.scalars(select(McpTool).where(McpTool.server_id == server_id))).all()
    existing = {
        item.tool_id
        for item in (
            await session.scalars(
                select(McpUserTool).where(
                    McpUserTool.user_id == user_id,
                    McpUserTool.tool_id.in_([tool.id for tool in tools]),
                )
            )
        ).all()
    }
    for tool in tools:
        if tool.id not in existing:
            session.add(McpUserTool(user_id=user_id, tool_id=tool.id, enabled=False))
