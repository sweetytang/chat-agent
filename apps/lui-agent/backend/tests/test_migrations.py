from pathlib import Path


def test_refresh_token_migration_has_expected_revision_chain_and_columns() -> None:
    migration = Path(__file__).parents[1] / "migrations" / "versions" / "0002_refresh_tokens.py"
    source = migration.read_text()

    assert 'revision: str = "0002_refresh_tokens"' in source
    assert 'down_revision: str | None = "0001_initial"' in source
    for column in ("token_hash", "expires_at", "revoked_at", "replaced_by_token_id"):
        assert f'"{column}"' in source
    assert 'op.create_table(\n        "refresh_tokens"' in source
    assert 'op.drop_table("refresh_tokens")' in source
