import pytest


@pytest.fixture(autouse=True)
def use_fake_provider_for_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    """测试不访问外部 Provider；真实 Provider 由独立冒烟测试显式配置。"""
    monkeypatch.setenv("LUI_AGENT_PROVIDER", "fake")
    monkeypatch.delenv("LUI_AGENT_API_KEY", raising=False)
