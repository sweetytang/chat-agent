"""Add MCP core definitions and user roles."""

from alembic import op
import sqlalchemy as sa

revision = "0004_mcp_core"
down_revision = "0003_thread_pinning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("role", sa.String(length=16), server_default="USER", nullable=False)
    )
    op.create_table(
        "mcp_server_definitions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("transport", sa.String(length=32), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=True),
        sa.Column("encrypted_credentials", sa.Text(), nullable=True),
        sa.Column("approved_config", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="DISABLED", nullable=False),
        sa.Column("security_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_server_definitions_owner_id", "mcp_server_definitions", ["owner_id"])
    op.create_table(
        "mcp_user_servers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("server_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["server_id"], ["mcp_server_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_user_servers_user_id", "mcp_user_servers", ["user_id"])
    op.create_index("ix_mcp_user_servers_server_id", "mcp_user_servers", ["server_id"])
    op.create_table(
        "mcp_tools",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("server_id", sa.Uuid(), nullable=False),
        sa.Column("remote_name", sa.String(length=255), nullable=False),
        sa.Column("internal_name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("input_schema", sa.JSON(), nullable=False),
        sa.Column("output_schema", sa.JSON(), nullable=True),
        sa.Column("annotations", sa.JSON(), nullable=False),
        sa.Column(
            "compatibility", sa.String(length=32), server_default="COMPATIBLE", nullable=False
        ),
        sa.Column("is_present", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["server_id"], ["mcp_server_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("internal_name"),
    )
    op.create_index("ix_mcp_tools_server_id", "mcp_tools", ["server_id"])
    op.create_index("ix_mcp_tools_internal_name", "mcp_tools", ["internal_name"])
    op.create_table(
        "mcp_user_tools",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("tool_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "approval_level", sa.String(length=32), server_default="REQUIRED", nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tool_id"], ["mcp_tools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_user_tools_user_id", "mcp_user_tools", ["user_id"])
    op.create_index("ix_mcp_user_tools_tool_id", "mcp_user_tools", ["tool_id"])


def downgrade() -> None:
    op.drop_table("mcp_user_tools")
    op.drop_table("mcp_tools")
    op.drop_table("mcp_user_servers")
    op.drop_table("mcp_server_definitions")
    op.drop_column("users", "role")
