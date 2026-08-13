import base64
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import McpScope, McpServerDefinition, McpTransport, User
from app.core.config import get_settings
from app.db.session import get_db_session
from app.modules.mcp.authz import admin_user, current_user
from app.modules.mcp.crypto import CredentialCrypto
from app.modules.mcp.network import NetworkPolicyError, validate_public_http_url
from app.modules.mcp.schemas import McpServerCreate, McpServerResponse

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _response(server: McpServerDefinition) -> McpServerResponse:
    return McpServerResponse(
        id=server.id, name=server.name, scope=server.scope, transport=server.transport,
        endpoint=server.endpoint, status=server.status.value,
        credential_configured=bool(server.encrypted_credentials), security_version=server.security_version,
    )


@router.get("/servers", response_model=list[McpServerResponse])
async def list_servers(user: User = Depends(current_user), session: AsyncSession = Depends(get_db_session)):
    query = select(McpServerDefinition).where(McpServerDefinition.deleted_at.is_(None)).where(
        (McpServerDefinition.scope == McpScope.SHARED) | (McpServerDefinition.owner_id == user.id)
    )
    return [_response(item) for item in (await session.scalars(query)).all()]


@router.post("/servers", response_model=McpServerResponse, status_code=status.HTTP_201_CREATED)
async def create_server(payload: McpServerCreate, user: User = Depends(current_user), session: AsyncSession = Depends(get_db_session)):
    if payload.scope is McpScope.SHARED and user.role.value != "ADMIN":
        raise HTTPException(status_code=403, detail="只有管理员可以创建共享 MCP")
    endpoint = payload.endpoint
    if endpoint and payload.transport is McpTransport.STREAMABLE_HTTP:
        try:
            endpoint = validate_public_http_url(endpoint)
        except NetworkPolicyError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    credentials = dict(payload.headers)
    if payload.bearer_token:
        credentials["Authorization"] = f"Bearer {payload.bearer_token}"
    encrypted_credentials: str | None = None
    if credentials:
        key_text = get_settings().mcp_encryption_key
        if not key_text:
            raise HTTPException(status_code=503, detail="MCP 凭据加密未配置")
        try:
            key = base64.urlsafe_b64decode(key_text.encode())
            encrypted_credentials = CredentialCrypto(key).encrypt(json.dumps(credentials))
        except (ValueError, UnicodeDecodeError) as error:
            raise HTTPException(status_code=503, detail="MCP 凭据加密配置无效") from error
    server = McpServerDefinition(
        owner_id=None if payload.scope is McpScope.SHARED else user.id,
        name=payload.name, scope=payload.scope, transport=payload.transport,
        endpoint=endpoint, encrypted_credentials=encrypted_credentials, approved_config={},
    )
    session.add(server)
    await session.commit()
    await session.refresh(server)
    return _response(server)


@router.get("/admin/servers", response_model=list[McpServerResponse])
async def list_admin_servers(user: User = Depends(admin_user), session: AsyncSession = Depends(get_db_session)):
    result = await session.scalars(select(McpServerDefinition).where(McpServerDefinition.deleted_at.is_(None)))
    return [_response(item) for item in result.all()]
