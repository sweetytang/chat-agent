"""simplify mcp tables to user_mcp_servers

Revision ID: 0007_simplify_mcp
Revises: 0006_drop_messages
Create Date: 2026-09-16 15:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_simplify_mcp"
down_revision = "0006_drop_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 丢弃旧的四张表
    op.drop_table("mcp_user_tools")
    op.drop_table("mcp_tools")
    op.drop_table("mcp_user_servers")
    op.drop_table("mcp_server_definitions")

    # 2. 新建 user_mcp_servers 表
    op.create_table(
        "user_mcp_servers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("transport", sa.String(length=32), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=True),
        sa.Column("command", sa.String(length=255), nullable=True),
        sa.Column("args", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("process_env", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("request_headers", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("tool_rules", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_user_mcp_server_name"),
    )
    op.create_index(op.f("ix_user_mcp_servers_user_id"), "user_mcp_servers", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_mcp_servers_user_id"), table_name="user_mcp_servers")
    op.drop_table("user_mcp_servers")
