from app.core.config import get_settings
from app.db.base import Base
from app.db.models import RefreshToken


def test_core_models_are_registered() -> None:
    assert {
        "users",
        "refresh_tokens",
        "threads",
        "runs",
        "messages",
        "checkpoints",
        "interrupts",
    } <= set(Base.metadata.tables)


def test_refresh_token_columns_are_persisted_safely() -> None:
    columns = Base.metadata.tables[RefreshToken.__tablename__].c

    assert columns.token_hash.type.length == 64
    assert columns.token_hash.unique is True
    assert columns.expires_at.nullable is False
    assert columns.revoked_at.nullable is True


def test_database_url_is_postgresql() -> None:
    assert "postgresql" in str(get_settings().database_url)
