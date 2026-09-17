from functools import lru_cache

from pydantic import PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用运行配置；数据库从第一版开始只接受 PostgreSQL DSN。"""

    model_config = SettingsConfigDict(
        env_file=(".env", "apps/api-server/.env"), env_prefix="LUI_AGENT_", extra="ignore"
    )

    app_name: str = "lui-agent"
    environment: str = "development"
    database_url: PostgresDsn = PostgresDsn(
        "postgresql+asyncpg://lui_agent:lui_agent@localhost:5433/lui_agent"
    )
    jwt_secret: str = "change-me-in-development"
    mcp_encryption_key: str = ""
    mcp_stdio_commands: str = "npx"
    enable_local_mcp: bool = True
    allowed_local_commands: list[str] = ["npx", "uvx", "node", "python", "python3"]

    @field_validator("database_url", mode="after")
    @classmethod
    def require_postgresql(cls, value: PostgresDsn) -> PostgresDsn:
        if value.scheme not in {"postgresql", "postgresql+asyncpg"}:
            raise ValueError("database_url must use PostgreSQL")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
