from datetime import datetime
import enum
from typing import Any
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RunStatus(enum.StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    INTERRUPTED = "INTERRUPTED"
    RESUMING = "RESUMING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MessageRole(enum.StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    SYSTEM = "system"


class InterruptStatus(enum.StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    EDITED = "EDITED"
    REJECTED = "REJECTED"
    RESUMED = "RESUMED"


class UserRole(enum.StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"


class McpTransport(enum.StrEnum):
    STREAMABLE_HTTP = "STREAMABLE_HTTP"
    STDIO = "STDIO"


class McpScope(enum.StrEnum):
    PRIVATE = "PRIVATE"
    SHARED = "SHARED"


class McpServerStatus(enum.StrEnum):
    DISABLED = "DISABLED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    ERROR = "ERROR"


def string_enum(enum_type: type[enum.Enum], *, name: str, length: int) -> Enum:
    """将 Python enum 映射到 VARCHAR，与现有迁移保持一致。"""
    return Enum(
        enum_type,
        name=name,
        native_enum=False,
        create_constraint=False,
        length=length,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        string_enum(UserRole, name="user_role", length=16),
        default=UserRole.USER,
        server_default="USER",
    )


class RefreshToken(TimestampMixin, Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_token_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("refresh_tokens.id", ondelete="SET NULL")
    )


class Thread(TimestampMixin, Base):
    __tablename__ = "threads"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(255))
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    current_checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(index=True)


class Run(TimestampMixin, Base):
    __tablename__ = "runs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status"), default=RunStatus.QUEUED
    )
    queue_position: Mapped[int | None] = mapped_column()
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)


class Message(TimestampMixin, Base):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("runs.id", ondelete="SET NULL"))
    checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole, name="message_role"))
    content: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Checkpoint(TimestampMixin, Base):
    __tablename__ = "checkpoints"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("checkpoints.id", ondelete="SET NULL")
    )
    state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    branch_name: Mapped[str | None] = mapped_column(String(255))


class Interrupt(TimestampMixin, Base):
    __tablename__ = "interrupts"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("checkpoints.id", ondelete="SET NULL")
    )
    request_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[InterruptStatus] = mapped_column(
        Enum(InterruptStatus, name="interrupt_status"), default=InterruptStatus.PENDING
    )


class McpServerDefinition(TimestampMixin, Base):
    __tablename__ = "mcp_server_definitions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    scope: Mapped[McpScope] = mapped_column(string_enum(McpScope, name="mcp_scope", length=16))
    transport: Mapped[McpTransport] = mapped_column(
        string_enum(McpTransport, name="mcp_transport", length=32)
    )
    endpoint: Mapped[str | None] = mapped_column(Text)
    encrypted_credentials: Mapped[str | None] = mapped_column(Text)
    approved_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[McpServerStatus] = mapped_column(
        string_enum(McpServerStatus, name="mcp_server_status", length=16),
        default=McpServerStatus.DISABLED,
        server_default="DISABLED",
    )
    security_version: Mapped[int] = mapped_column(default=1, server_default="1")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class McpUserServer(TimestampMixin, Base):
    __tablename__ = "mcp_user_servers"
    __table_args__ = (UniqueConstraint("user_id", "server_id", name="uq_mcp_user_server"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    server_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mcp_server_definitions.id", ondelete="CASCADE"), index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_error: Mapped[str | None] = mapped_column(Text)
    last_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class McpTool(TimestampMixin, Base):
    __tablename__ = "mcp_tools"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mcp_server_definitions.id", ondelete="CASCADE"), index=True
    )
    remote_name: Mapped[str] = mapped_column(String(255))
    internal_name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    input_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_schema: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    annotations: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    compatibility: Mapped[str] = mapped_column(
        String(32), default="COMPATIBLE", server_default="COMPATIBLE"
    )
    is_present: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class McpUserTool(TimestampMixin, Base):
    __tablename__ = "mcp_user_tools"
    __table_args__ = (UniqueConstraint("user_id", "tool_id", name="uq_mcp_user_tool"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    tool_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mcp_tools.id", ondelete="CASCADE"), index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    approval_level: Mapped[str] = mapped_column(
        String(32), default="REQUIRED", server_default="REQUIRED"
    )
