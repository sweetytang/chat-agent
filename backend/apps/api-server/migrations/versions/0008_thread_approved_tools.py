"""add approved_tools to threads table

Revision ID: 0008_thread_approved_tools
Revises: 0007_simplify_mcp
Create Date: 2026-09-17 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0008_thread_approved_tools"
down_revision = "0007_simplify_mcp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("threads")]
    if "approved_tools" not in columns:
        op.add_column(
            "threads",
            sa.Column("approved_tools", sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("threads")]
    if "approved_tools" in columns:
        op.drop_column("threads", "approved_tools")
