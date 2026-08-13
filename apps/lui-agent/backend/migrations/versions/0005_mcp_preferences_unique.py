"""Keep one MCP preference per user and resource."""

from alembic import op

revision = "0005_mcp_preferences_unique"
down_revision = "0004_mcp_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0004 没有唯一约束。保留最后更新的偏好，避免已有开发库加约束失败。
    op.execute(
        """
        DELETE FROM mcp_user_servers AS stale
        USING mcp_user_servers AS current
        WHERE stale.user_id = current.user_id
          AND stale.server_id = current.server_id
          AND (stale.updated_at, stale.id) < (current.updated_at, current.id)
        """
    )
    op.execute(
        """
        DELETE FROM mcp_user_tools AS stale
        USING mcp_user_tools AS current
        WHERE stale.user_id = current.user_id
          AND stale.tool_id = current.tool_id
          AND (stale.updated_at, stale.id) < (current.updated_at, current.id)
        """
    )
    op.create_unique_constraint("uq_mcp_user_server", "mcp_user_servers", ["user_id", "server_id"])
    op.create_unique_constraint("uq_mcp_user_tool", "mcp_user_tools", ["user_id", "tool_id"])


def downgrade() -> None:
    op.drop_constraint("uq_mcp_user_tool", "mcp_user_tools", type_="unique")
    op.drop_constraint("uq_mcp_user_server", "mcp_user_servers", type_="unique")
