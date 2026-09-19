"""add skills table

Revision ID: 0009_skills
Revises: 0008_thread_approved_tools
Create Date: 2026-09-19 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "0009_skills"
down_revision = "0008_thread_approved_tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "skills" not in tables:
        op.create_table(
            "skills",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "name", name="uq_user_skill_name"),
        )
        op.create_index(op.f("ix_skills_user_id"), "skills", ["user_id"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "skills" in tables:
        op.drop_index(op.f("ix_skills_user_id"), table_name="skills")
        op.drop_table("skills")
