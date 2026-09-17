"""MCP 模块轻量化 Pydantic 模型。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class UserMcpServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    transport: str = Field(default="streamable_http", pattern="^(streamable_http|sse|stdio)$")
    endpoint: str | None = None
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    process_env: dict[str, str] = Field(default_factory=dict)
    request_headers: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True
    tool_rules: dict[str, Any] = Field(default_factory=dict)


class UserMcpServerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    transport: str | None = Field(default=None, pattern="^(streamable_http|sse|stdio)$")
    endpoint: str | None = None
    command: str | None = None
    args: list[str] | None = None
    process_env: dict[str, str] | None = None
    request_headers: dict[str, str] | None = None
    enabled: bool | None = None
    tool_rules: dict[str, Any] | None = None


class UserMcpServerResponse(BaseModel):
    id: UUID
    name: str
    transport: str
    endpoint: str | None = None
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    process_env: dict[str, str] = Field(default_factory=dict)
    request_headers: dict[str, str] = Field(default_factory=dict)
    enabled: bool
    tool_rules: dict[str, Any] = Field(default_factory=dict)
    last_error: str | None = None


class McpConfigSyncRequest(BaseModel):
    """用于从前端 JSON 编辑器全量同步 mcpServers。"""

    mcpServers: dict[str, dict[str, Any]]


@dataclass(frozen=True)
class ToolIdentity:
    server_id: str
    remote_name: str
    internal_name: str
