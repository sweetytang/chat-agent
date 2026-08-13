import base64
from datetime import UTC, datetime
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import (
    McpScope,
    McpServerDefinition,
    McpServerStatus,
    McpTool,
    McpTransport,
    McpUserServer,
    McpUserTool,
    User,
    UserRole,
)
from app.db.session import get_db_session
from app.modules.mcp.authz import admin_user, current_user
from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.host.client import McpHost
from app.modules.mcp.network import NetworkPolicyError, validate_public_http_url
from app.modules.mcp.schemas import (
    McpServerCreate,
    McpServerResponse,
    McpServerUpdate,
    McpToolResponse,
)
from app.modules.mcp.service import McpRefreshError, refresh_server_catalog

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def get_mcp_host() -> McpHost:
    raise HTTPException(status_code=503, detail="MCP Host 未配置")


class TogglePayload(BaseModel):
    enabled: bool


def _server_response(
    server: McpServerDefinition, binding: McpUserServer | None = None
) -> McpServerResponse:
    return McpServerResponse(
        id=server.id,
        name=server.name,
        scope=server.scope,
        transport=server.transport,
        endpoint=server.endpoint,
        status=server.status.value,
        enabled=binding.enabled if binding is not None else False,
        last_error=binding.last_error if binding is not None else None,
        credential_configured=bool(server.encrypted_credentials),
        security_version=server.security_version,
    )


def _encrypt_credentials(headers: dict[str, str], bearer_token: str | None) -> str | None:
    credentials = dict(headers)
    if bearer_token:
        credentials["Authorization"] = f"Bearer {bearer_token}"
    if not credentials:
        return None

    key_text = get_settings().mcp_encryption_key
    if not key_text:
        raise HTTPException(status_code=503, detail="MCP 凭据加密未配置")
    try:
        key = base64.urlsafe_b64decode(key_text.encode())
        return CredentialCrypto(key).encrypt(json.dumps(credentials))
    except (ValueError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=503, detail="MCP 凭据加密配置无效") from error


def _decrypt_credentials(encrypted: str | None) -> dict[str, str]:
    if encrypted is None:
        return {}
    key_text = get_settings().mcp_encryption_key
    try:
        key = base64.urlsafe_b64decode(key_text.encode())
        value = json.loads(CredentialCrypto(key).decrypt(encrypted))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=503, detail="MCP 凭据不可用") from error
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise HTTPException(status_code=503, detail="MCP 凭据不可用")
    return value


def _validated_endpoint(transport: McpTransport, endpoint: str | None) -> str | None:
    if transport is not McpTransport.STREAMABLE_HTTP or endpoint is None:
        return endpoint
    try:
        settings = get_settings()
        return validate_public_http_url(
            endpoint,
            allow_http=settings.environment == "development",
            allow_local=settings.environment == "development",
        )
    except NetworkPolicyError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _can_manage(server: McpServerDefinition, user: User) -> bool:
    if server.scope is McpScope.SHARED:
        return user.role is UserRole.ADMIN
    return bool(server.owner_id == user.id)


async def _visible_server(
    session: AsyncSession, server_id: UUID, user: User
) -> McpServerDefinition:
    server = await session.get(McpServerDefinition, server_id)
    if (
        server is None
        or server.deleted_at is not None
        or (server.scope is McpScope.PRIVATE and server.owner_id != user.id)
    ):
        raise HTTPException(status_code=404, detail="MCP Server 不存在")
    return server


@router.get("/servers", response_model=list[McpServerResponse])
async def list_servers(
    user: User = Depends(current_user), session: AsyncSession = Depends(get_db_session)
) -> list[McpServerResponse]:
    query = (
        select(McpServerDefinition, McpUserServer)
        .outerjoin(
            McpUserServer,
            (McpUserServer.server_id == McpServerDefinition.id)
            & (McpUserServer.user_id == user.id),
        )
        .where(McpServerDefinition.deleted_at.is_(None))
        .where(
            (McpServerDefinition.scope == McpScope.SHARED)
            | (McpServerDefinition.owner_id == user.id)
        )
        .order_by(McpServerDefinition.created_at)
    )
    rows = (await session.execute(query)).all()
    return [_server_response(server, binding) for server, binding in rows]


@router.post("/servers", response_model=McpServerResponse, status_code=status.HTTP_201_CREATED)
async def create_server(
    payload: McpServerCreate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> McpServerResponse:
    if payload.scope is McpScope.SHARED and user.role is not UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="只有管理员可以创建共享 MCP")
    if payload.transport is McpTransport.STDIO and user.role is not UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="只有管理员可以创建 stdio MCP")

    server = McpServerDefinition(
        owner_id=None if payload.scope is McpScope.SHARED else user.id,
        name=payload.name.strip(),
        scope=payload.scope,
        transport=payload.transport,
        endpoint=_validated_endpoint(payload.transport, payload.endpoint),
        encrypted_credentials=_encrypt_credentials(payload.headers, payload.bearer_token),
        approved_config={},
    )
    session.add(server)
    await session.commit()
    await session.refresh(server)
    return _server_response(server)


@router.patch("/servers/{server_id}", response_model=McpServerResponse)
async def update_server(
    server_id: UUID,
    payload: McpServerUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
    host: McpHost = Depends(get_mcp_host),
) -> McpServerResponse:
    server = await _visible_server(session, server_id, user)
    if not _can_manage(server, user):
        raise HTTPException(status_code=403, detail="无权修改 MCP Server")

    security_changed = False
    if "name" in payload.model_fields_set and payload.name is not None:
        server.name = payload.name.strip()
    if "endpoint" in payload.model_fields_set:
        if server.transport is McpTransport.STREAMABLE_HTTP and not payload.endpoint:
            raise HTTPException(status_code=422, detail="HTTP MCP 必须提供 endpoint")
        server.endpoint = _validated_endpoint(server.transport, payload.endpoint)
        security_changed = True
    if "headers" in payload.model_fields_set or "bearer_token" in payload.model_fields_set:
        server.encrypted_credentials = _encrypt_credentials(
            payload.headers or {}, payload.bearer_token
        )
        security_changed = True
    if security_changed:
        server.security_version += 1

    await session.commit()
    if security_changed:
        await host.disconnect(server.id)
    await session.refresh(server)
    binding = await session.scalar(
        select(McpUserServer).where(
            McpUserServer.user_id == user.id, McpUserServer.server_id == server.id
        )
    )
    return _server_response(server, binding)


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    server_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    server = await _visible_server(session, server_id, user)
    if not _can_manage(server, user):
        raise HTTPException(status_code=403, detail="无权删除 MCP Server")
    server.deleted_at = datetime.now(UTC)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/servers", response_model=list[McpServerResponse])
async def list_admin_servers(
    user: User = Depends(admin_user), session: AsyncSession = Depends(get_db_session)
) -> list[McpServerResponse]:
    del user
    result = await session.scalars(
        select(McpServerDefinition).where(McpServerDefinition.deleted_at.is_(None))
    )
    return [_server_response(item) for item in result.all()]


@router.get("/servers/{server_id}/tools", response_model=list[McpToolResponse])
async def list_server_tools(
    server_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[McpToolResponse]:
    await _visible_server(session, server_id, user)
    query = (
        select(McpTool, McpUserTool)
        .outerjoin(
            McpUserTool,
            (McpUserTool.tool_id == McpTool.id) & (McpUserTool.user_id == user.id),
        )
        .where(McpTool.server_id == server_id)
        .order_by(McpTool.remote_name)
    )
    rows = (await session.execute(query)).all()
    return [
        McpToolResponse(
            id=tool.id,
            remote_name=tool.remote_name,
            internal_name=tool.internal_name,
            description=tool.description,
            compatibility=tool.compatibility,
            is_present=tool.is_present,
            enabled=binding.enabled if binding is not None else False,
        )
        for tool, binding in rows
    ]


@router.post("/servers/{server_id}/enabled")
async def set_server_enabled(
    server_id: UUID,
    payload: TogglePayload,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
    host: McpHost = Depends(get_mcp_host),
) -> dict[str, bool]:
    server = await _visible_server(session, server_id, user)
    statement = (
        insert(McpUserServer)
        .values(user_id=user.id, server_id=server_id, enabled=payload.enabled)
        .on_conflict_do_update(constraint="uq_mcp_user_server", set_={"enabled": payload.enabled})
    )
    await session.execute(statement)
    await session.commit()
    if not payload.enabled:
        server.security_version += 1
        await host.disconnect(server_id)
        server.status = McpServerStatus.DISABLED
        await session.commit()
        return {"enabled": False}
    if server.transport is McpTransport.STDIO:
        server.status = McpServerStatus.ERROR
        binding = await session.scalar(
            select(McpUserServer).where(
                McpUserServer.user_id == user.id,
                McpUserServer.server_id == server.id,
            )
        )
        if binding is not None:
            binding.last_error = "stdio MCP 编排服务尚未配置"
        await session.commit()
        raise HTTPException(status_code=503, detail="stdio MCP 编排服务尚未配置")
    try:
        await refresh_server_catalog(
            session,
            host,
            server,
            user.id,
            headers=_decrypt_credentials(server.encrypted_credentials),
        )
    except McpRefreshError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {"enabled": payload.enabled}


@router.post("/servers/{server_id}/refresh", response_model=McpServerResponse)
async def refresh_server(
    server_id: UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
    host: McpHost = Depends(get_mcp_host),
) -> McpServerResponse:
    server = await _visible_server(session, server_id, user)
    try:
        await refresh_server_catalog(
            session,
            host,
            server,
            user.id,
            headers=_decrypt_credentials(server.encrypted_credentials),
        )
    except McpRefreshError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    binding = await session.scalar(
        select(McpUserServer).where(
            McpUserServer.user_id == user.id, McpUserServer.server_id == server.id
        )
    )
    return _server_response(server, binding)


@router.post("/tools/{tool_id}/enabled")
async def set_tool_enabled(
    tool_id: UUID,
    payload: TogglePayload,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    tool = await session.get(McpTool, tool_id)
    if tool is None:
        raise HTTPException(status_code=404, detail="MCP 工具不存在")
    await _visible_server(session, tool.server_id, user)
    if payload.enabled and (not tool.is_present or tool.compatibility == "INCOMPATIBLE"):
        raise HTTPException(status_code=409, detail="MCP 工具当前不可启用")

    statement = (
        insert(McpUserTool)
        .values(user_id=user.id, tool_id=tool_id, enabled=payload.enabled)
        .on_conflict_do_update(constraint="uq_mcp_user_tool", set_={"enabled": payload.enabled})
    )
    await session.execute(statement)
    await session.commit()
    return {"enabled": payload.enabled}
