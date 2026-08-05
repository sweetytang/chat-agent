import pytest

from app.integrations.tools.registry import default_registry


@pytest.mark.asyncio
async def test_default_registry_has_safe_weather_and_search_tools() -> None:
    registry = default_registry()

    weather = await registry.execute(
        type("Call", (), {"id": "1", "name": "weather", "args": {"city": "上海"}})()
    )
    assert weather.content["temperature_c"] == 22
    assert registry.requires_approval("web_search") is True
