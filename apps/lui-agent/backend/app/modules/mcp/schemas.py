from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.db.models import McpScope, McpTransport


class McpServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scope: McpScope = McpScope.PRIVATE
    transport: McpTransport = McpTransport.STREAMABLE_HTTP
    endpoint: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    bearer_token: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_transport(self) -> McpServerCreate:
        if self.transport is McpTransport.STREAMABLE_HTTP and not self.endpoint:
            raise ValueError("HTTP MCP 必须提供 endpoint")
        if self.transport is McpTransport.STDIO and self.scope is not McpScope.SHARED:
            raise ValueError("stdio MCP 只能由管理员作为共享定义预装")
        return self


class McpServerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    endpoint: str | None = None
    headers: dict[str, str] | None = None
    bearer_token: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_change(self) -> McpServerUpdate:
        if not self.model_fields_set:
            raise ValueError("至少提供一个要更新的字段")
        return self


class McpServerResponse(BaseModel):
    id: UUID
    name: str
    scope: McpScope
    transport: McpTransport
    endpoint: str | None
    status: str
    enabled: bool = False
    last_error: str | None = None
    credential_configured: bool
    security_version: int


class McpToolResponse(BaseModel):
    id: UUID
    remote_name: str
    internal_name: str
    description: str | None
    compatibility: str
    is_present: bool
    enabled: bool = False
