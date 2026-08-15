from collections.abc import AsyncIterator, Iterator, Sequence
import json
from typing import Any

from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from pydantic import Field


class FakeChatModel(BaseChatModel):
    """不访问外部服务的模型，用于 graph/事件协议测试和本地开发。"""

    response: str = "收到你的消息。"
    chunks: Sequence[str] | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    additional_kwargs: dict[str, Any] = Field(default_factory=dict)

    @property
    def _llm_type(self) -> str:
        return "lui-agent-fake-chat-model"

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> FakeChatModel:
        """Fake 模型不需要修改请求，只需满足真实模型的绑定接口。"""
        return self

    def _message(self) -> AIMessage:
        return AIMessage(
            content=self.response,
            tool_calls=self.tool_calls,
            additional_kwargs=self.additional_kwargs,
        )

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._message())])

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return self._generate(messages, stop=stop, **kwargs)

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        for part in self.chunks if self.chunks is not None else (self.response,):
            yield ChatGenerationChunk(message=AIMessageChunk(content=part))
        for index, call in enumerate(self.tool_calls):
            yield ChatGenerationChunk(
                message=AIMessageChunk(
                    content="",
                    tool_call_chunks=[
                        {
                            "name": call.get("name", ""),
                            "args": json.dumps(call.get("args", {})),
                            "id": call.get("id", f"fake-call-{index}"),
                            "index": index,
                        }
                    ],
                )
            )

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        for chunk in self._stream(messages, stop=stop, **kwargs):
            yield chunk
