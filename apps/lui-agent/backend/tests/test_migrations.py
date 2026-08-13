from pathlib import Path


def test_dev_backend_runs_migrations_before_uvicorn() -> None:
    makefile = Path(__file__).parents[2] / "Makefile"
    source = makefile.read_text()

    assert "db-up: ## 启动 PostgreSQL" in source
    assert "docker compose up -d --wait" in source
    assert "db-migrate: db-up ## 执行数据库迁移" in source
    assert "cd $(BACKEND_DIR) && uv run alembic upgrade head" in source
    assert "dev-backend: db-migrate ## 启动 FastAPI 后端" in source


def test_initial_migration_creates_checkpoint_schema() -> None:
    migration = Path(__file__).parents[1] / "migrations" / "versions" / "0001_initial.py"
    source = migration.read_text()

    assert 'revision: str = "0001_initial"' in source
    assert 'op.create_table(\n        "checkpoints"' in source
    for column in ('"thread_id"', '"parent_id"', '"state"', '"branch_name"'):
        assert f"sa.Column({column}" in source
    assert 'sa.ForeignKeyConstraint(["parent_id"], ["checkpoints.id"]' in source


def test_refresh_token_migration_has_expected_revision_chain_and_columns() -> None:
    migration = Path(__file__).parents[1] / "migrations" / "versions" / "0002_refresh_tokens.py"
    source = migration.read_text()

    assert 'revision: str = "0002_refresh_tokens"' in source
    assert 'down_revision: str | None = "0001_initial"' in source
    for column in ("token_hash", "expires_at", "revoked_at", "replaced_by_token_id"):
        assert f'"{column}"' in source
    assert 'op.create_table(\n        "refresh_tokens"' in source
    assert 'op.drop_table("refresh_tokens")' in source


def test_thread_pinning_migration_is_persisted_and_reversible() -> None:
    migration = Path(__file__).parents[1] / "migrations" / "versions" / "0003_thread_pinning.py"
    source = migration.read_text()

    assert 'revision: str = "0003_thread_pinning"' in source
    assert 'down_revision: str | None = "0002_refresh_tokens"' in source
    assert (
        'sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=False)' in source
    )
    assert 'op.drop_column("threads", "is_pinned")' in source


def test_mcp_preference_migration_deduplicates_and_adds_unique_constraints() -> None:
    migration = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "0005_mcp_preferences_unique.py"
    )
    source = migration.read_text()

    assert 'revision = "0005_mcp_preferences_unique"' in source
    assert 'down_revision = "0004_mcp_core"' in source
    assert "DELETE FROM mcp_user_servers AS stale" in source
    assert "DELETE FROM mcp_user_tools AS stale" in source
    assert '"uq_mcp_user_server"' in source
    assert '"uq_mcp_user_tool"' in source
    assert 'type_="unique"' in source
