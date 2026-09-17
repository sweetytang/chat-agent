"""极简 MCP 服务端路由：单表维护、动态 Tool 探测与 JSON 全量同步。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import current_user
from app.db.models import User, UserMcpServer
from app.db.session import get_db_session
from app.modules.mcp.host.state import McpConnectionState
from app.modules.mcp.schemas import (
    McpConfigSyncRequest,
    UserMcpServerCreate,
    UserMcpServerResponse,
    UserMcpServerUpdate,
)
from app.modules.mcp.security import validate_stdio_command
from app.modules.runs.dependencies import run_dependencies_manager

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


@router.get("/servers", response_model=list[UserMcpServerResponse])
async def list_user_mcp_servers(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserMcpServer]:
    result = await session.execute(
        select(UserMcpServer)
        .where(UserMcpServer.user_id == user.id)
        .order_by(UserMcpServer.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/servers/{server_id}/tools")
async def list_server_live_tools(
    server_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, Any]]:
    """实时探测并返回该 MCP Server 提供的真实工具列表及当前配置的开关规则。"""
    result = await session.execute(
        select(UserMcpServer).where(UserMcpServer.id == server_id, UserMcpServer.user_id == user.id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")

    host = run_dependencies_manager.get_run_dependencies().get_mcp_host()
    if host is None:
        raise HTTPException(status_code=503, detail="MCP Host 服务未就绪")

    try:
        descriptors = host.catalog(server.id)
        if host.state(server.id) is not McpConnectionState.CONNECTED or not descriptors:
            descriptors = await host.get_tool_descriptors(
                server.id,
                endpoint=server.endpoint,
                headers=server.request_headers or {},
                command=server.command,
                args=server.args or [],
                env=server.process_env or {},
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"无法连接 MCP Server 探测工具: {exc}") from exc

    tool_rules = (server.tool_rules or {}).get("tools", {})
    tools: list[dict[str, Any]] = []
    for tool in descriptors:
        name = tool.remote_name
        desc = tool.description or ""
        rule = tool_rules.get(name, {})
        tools.append(
            {
                "name": name,
                "description": desc,
                "enabled": rule.get("enabled", True),
                "require_approval": rule.get("require_approval", True),
            }
        )

    return tools


@router.post("/servers", response_model=UserMcpServerResponse, status_code=status.HTTP_201_CREATED)
async def create_user_mcp_server(
    payload: UserMcpServerCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserMcpServer:
    if payload.transport == "stdio":
        validate_stdio_command(payload.command, payload.args)
    elif not payload.endpoint:
        raise HTTPException(status_code=400, detail="远程 HTTP/SSE MCP 必须提供 endpoint")

    existing = await session.execute(
        select(UserMcpServer).where(
            UserMcpServer.user_id == user.id, UserMcpServer.name == payload.name
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"服务名 '{payload.name}' 已存在")

    server = UserMcpServer(
        user_id=user.id,
        name=payload.name,
        transport=payload.transport,
        endpoint=payload.endpoint,
        command=payload.command,
        args=payload.args,
        process_env=payload.process_env,
        request_headers=payload.request_headers,
        enabled=payload.enabled,
        tool_rules=payload.tool_rules,
    )
    session.add(server)
    await session.commit()
    await session.refresh(server)
    return server


@router.patch("/servers/{server_id}", response_model=UserMcpServerResponse)
async def update_user_mcp_server(
    server_id: UUID,
    payload: UserMcpServerUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserMcpServer:
    result = await session.execute(
        select(UserMcpServer).where(UserMcpServer.id == server_id, UserMcpServer.user_id == user.id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")

    update_data = payload.model_dump(exclude_unset=True)
    target_transport = update_data.get("transport", server.transport)
    target_command = update_data.get("command", server.command)
    target_args = update_data.get("args", server.args)

    if target_transport == "stdio":
        validate_stdio_command(target_command, target_args)

    for field, value in update_data.items():
        setattr(server, field, value)

    await session.commit()
    await session.refresh(server)
    return server


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_mcp_server(
    server_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    result = await session.execute(
        select(UserMcpServer).where(UserMcpServer.id == server_id, UserMcpServer.user_id == user.id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")
    await session.delete(server)
    await session.commit()


@router.put("/config", response_model=list[UserMcpServerResponse])
async def sync_mcp_json_config(
    payload: McpConfigSyncRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserMcpServer]:
    """从前端标准 mcpServers JSON 配置一键全量同步（保留已有 tool_rules 并支持增删改）。"""
    # 1. 一次性查出当前用户所有的已有配置（避免 N 次查库）
    existing_result = await session.execute(
        select(UserMcpServer).where(UserMcpServer.user_id == user.id)
    )
    existing_map: dict[str, UserMcpServer] = {
        server.name: server for server in existing_result.scalars().all()
    }

    submitted_names = set(payload.mcpServers.keys())
    saved_servers: list[UserMcpServer] = []

    # 2. 遍历新配置：执行更新或创建
    for name, config in payload.mcpServers.items():
        transport = "stdio" if "command" in config else config.get("transport", "streamable_http")
        command = config.get("command")
        args = config.get("args") or []
        endpoint = config.get("url") or config.get("endpoint")
        process_env = config.get("env") or {}
        request_headers = config.get("headers") or {}
        enabled = config.get("enabled", True)

        if transport == "stdio":
            validate_stdio_command(command, args)
        elif not endpoint:
            raise HTTPException(status_code=400, detail=f"服务 '{name}' 缺少连接 URL")

        if name in existing_map:
            # 原地更新配置，完全保留历史 tool_rules
            server = existing_map[name]
            server.transport = transport
            server.endpoint = endpoint
            server.command = command
            server.args = args
            server.process_env = process_env
            server.request_headers = request_headers
            server.enabled = enabled
            saved_servers.append(server)
        else:
            # 新增配置
            new_server = UserMcpServer(
                user_id=user.id,
                name=name,
                transport=transport,
                endpoint=endpoint,
                command=command,
                args=args,
                process_env=process_env,
                request_headers=request_headers,
                enabled=enabled,
            )
            session.add(new_server)
            saved_servers.append(new_server)

    # 3. 删除用户在 JSON 中删掉的旧服务（实现真正的全量 Sync）
    deleted_servers = [
        server for name, server in existing_map.items() if name not in submitted_names
    ]
    for server in deleted_servers:
        await session.delete(server)

    await session.commit()
    return saved_servers
