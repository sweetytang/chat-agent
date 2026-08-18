"""Drop the legacy messages table; timeline checkpoints are the only conversation source."""

from alembic import op

revision = "0006_drop_messages"
down_revision = "0005_mcp_preferences_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_messages_thread_id", table_name="messages")
    op.drop_table("messages")
    op.execute("DROP TYPE IF EXISTS message_role")


def downgrade() -> None:
    raise RuntimeError("messages 数据已破坏性删除，迁移不可逆")
