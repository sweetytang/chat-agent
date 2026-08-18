from app.core.config import get_settings
from app.db.base import Base
from app.db.models import RefreshToken, Thread


def test_core_models_are_registered() -> None:
    assert {
        "users",
        "refresh_tokens",
        "threads",
        "runs",
        "checkpoints",
        "interrupts",
    } <= set(Base.metadata.tables)
    assert "messages" not in Base.metadata.tables


def test_refresh_token_columns_are_persisted_safely() -> None:
    columns = Base.metadata.tables[RefreshToken.__tablename__].c

    assert columns.token_hash.type.length == 64
    assert columns.token_hash.unique is True
    assert columns.expires_at.nullable is False
    assert columns.revoked_at.nullable is True


def test_database_url_is_postgresql() -> None:
    assert "postgresql" in str(get_settings().database_url)


def test_thread_pinning_defaults_to_unpinned() -> None:
    column = Base.metadata.tables[Thread.__tablename__].c.is_pinned

    assert column.nullable is False
    assert column.server_default is not None
