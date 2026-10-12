from functools import lru_cache
import os
from typing import Any

from pydantic import PostgresDsn, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_ALLOWED_LOCAL_COMMANDS: list[str] = [
    "npx",
    "uvx",
    "node",
    "python",
    "python3",
]

DEFAULT_CORS_ORIGINS: list[str] = [
    "http://localhost:10001",
    "http://127.0.0.1:10001",
    "http://localhost:10000",
    "http://127.0.0.1:10000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://ai.tenasourcing.com",
    "https://agent.tenasourcing.com",
]


class Settings(BaseSettings):
    """应用运行配置；数据库从第一版开始只接受 PostgreSQL DSN。"""

    model_config = SettingsConfigDict(
        env_file=(".env", "apps/api-server/.env"), env_prefix="OPEN_AGENT_", extra="ignore"
    )

    app_name: str = "open-agent"
    environment: str = "development"
    database_url: PostgresDsn = PostgresDsn(
        "postgresql+asyncpg://lui_agent:lui_agent@localhost:5433/lui_agent"
    )
    jwt_secret: str = "change-me-in-development"
    mcp_encryption_key: str = ""
    mcp_stdio_commands: str = "npx"
    enable_local_mcp: bool = True
    allowed_local_commands: list[str] | str = DEFAULT_ALLOWED_LOCAL_COMMANDS
    cors_origins: list[str] | str = DEFAULT_CORS_ORIGINS
    cors_allow_all: bool = True
    cors_origin_regex: str | None = None

    @model_validator(mode="before")
    @classmethod
    def fallback_legacy_env(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in [
                "database_url",
                "jwt_secret",
                "mcp_encryption_key",
                "mcp_stdio_commands",
                "environment",
                "cors_origins",
                "cors_allow_all",
                "allowed_local_commands",
            ]:
                if field not in data or data[field] is None:
                    legacy_val = os.getenv(f"LUI_AGENT_{field.upper()}")
                    if legacy_val is not None:
                        data[field] = legacy_val
        return data

    @field_validator("allowed_local_commands", mode="after")
    @classmethod
    def normalize_allowed_local_commands(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            if not value.strip():
                return list(DEFAULT_ALLOWED_LOCAL_COMMANDS)
            return [cmd.strip() for cmd in value.split(",") if cmd.strip()]
        return value

    @field_validator("cors_origins", mode="after")
    @classmethod
    def normalize_cors_origins(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            if not value.strip():
                return list(DEFAULT_CORS_ORIGINS)
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def sanitize_database_url(cls, value: object) -> object:
        if isinstance(value, str):
            val = value.strip().strip("\"'")
            if "://" in val and "@" in val:
                scheme, rest = val.split("://", 1)
                userinfo, hostpath = rest.rsplit("@", 1)
                if ":" in userinfo:
                    user, password = userinfo.split(":", 1)
                    password = password.strip("\"'")
                    import urllib.parse

                    # 如果密码还没做 url 编码，将其安全编码
                    encoded_pass = urllib.parse.quote_plus(urllib.parse.unquote_plus(password))
                    return f"{scheme}://{user}:{encoded_pass}@{hostpath}"
            return val
        return value

    @field_validator("database_url", mode="after")
    @classmethod
    def require_postgresql(cls, value: PostgresDsn) -> PostgresDsn:
        if value.scheme not in {"postgresql", "postgresql+asyncpg"}:
            raise ValueError("database_url must use PostgreSQL")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
