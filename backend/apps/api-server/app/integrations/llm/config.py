import os
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderConfig(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    thinking_enabled: bool = False
    reasoning_effort: str | None = None
    provider: str = "fake"


class ProviderSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "apps/api-server/.env"),
        env_prefix="OPEN_AGENT_",
        extra="ignore",
    )

    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    thinking_enabled: bool = False
    reasoning_effort: str | None = None
    provider: str = "fake"

    @model_validator(mode="before")
    @classmethod
    def fallback_legacy_env(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in [
                "api_key",
                "base_url",
                "model_name",
                "thinking_enabled",
                "reasoning_effort",
                "provider",
            ]:
                if field not in data or data[field] is None:
                    legacy_val = os.getenv(f"LUI_AGENT_{field.upper()}")
                    if legacy_val is not None:
                        data[field] = legacy_val
        return data

    def to_config(self) -> ProviderConfig:
        return ProviderConfig(**self.model_dump())


@lru_cache
def get_provider_settings() -> ProviderSettings:
    return ProviderSettings()


def get_provider_config() -> ProviderConfig:
    return get_provider_settings().to_config()
