from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import SecretStr

from app.integrations.llm.config import ProviderConfig, get_provider_config
from app.integrations.llm.fake import FakeChatModel


def create_chat_model(config: ProviderConfig | None = None) -> BaseChatModel:
    """按配置创建进程内模型；fake provider 用于不依赖外部服务的测试。"""

    selected = config or get_provider_config()
    if selected.provider == "fake":
        return FakeChatModel()
    if not selected.model_name:
        raise ValueError("LUI_AGENT_MODEL_NAME is required for a real provider")
    # 延迟导入避免仅使用 fake model 的测试环境初始化 TLS/OpenAI 客户端。
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=SecretStr(selected.api_key) if selected.api_key else None,
        base_url=selected.base_url or None,
        model=selected.model_name,
        temperature=0 if not selected.thinking_enabled else None,
    )


build_chat_model = create_chat_model
