from functools import lru_cache

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderConfig(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    thinking_enabled: bool = False
    reasoning_effort: str | None = None
    provider: str = "fake"


class ProviderSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LUI_AGENT_", extra="ignore")

    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    thinking_enabled: bool = False
    reasoning_effort: str | None = None
    provider: str = "fake"

    def to_config(self) -> ProviderConfig:
        return ProviderConfig(**self.model_dump())


@lru_cache
def get_provider_settings() -> ProviderSettings:
    return ProviderSettings()


def get_provider_config() -> ProviderConfig:
    return get_provider_settings().to_config()
