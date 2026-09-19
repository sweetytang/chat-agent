"""add name to users table

Revision ID: 0010_user_name
Revises: 0009_skills
Create Date: 2026-10-12 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0010_user_name"
down_revision = "0009_skills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("users")]
    if "name" not in columns:
        op.add_column(
            "users",
            sa.Column("name", sa.String(length=100), nullable=False, server_default=""),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("users")]
    if "name" in columns:
        op.drop_column("users", "name")
