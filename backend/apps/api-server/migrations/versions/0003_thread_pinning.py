"""add persisted thread pinning

Revision ID: 0003_thread_pinning
Revises: 0002_refresh_tokens
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0003_thread_pinning"
down_revision: str | None = "0002_refresh_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "threads",
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("threads", "is_pinned")
