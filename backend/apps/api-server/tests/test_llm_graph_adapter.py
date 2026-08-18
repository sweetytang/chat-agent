from langchain_core.tools import tool
import pytest

from app.graph.runtime import stream_graph_events
from app.integrations.llm.config import ProviderSettings
from app.integrations.llm.fake import FakeChatModel


def test_provider_settings_builds_runtime_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUI_AGENT_MODEL_NAME", "fake-model")
    monkeypatch.setenv("LUI_AGENT_THINKING_ENABLED", "true")

    config = ProviderSettings().to_config()

    assert config.model_name == "fake-model"
    assert config.thinking_enabled is True


def test_provider_settings_loads_api_server_env_from_workspace_root(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    for key in (
        "LUI_AGENT_PROVIDER",
        "LUI_AGENT_API_KEY",
        "LUI_AGENT_BASE_URL",
        "LUI_AGENT_MODEL_NAME",
    ):
        monkeypatch.delenv(key, raising=False)
    env_dir = tmp_path / "apps" / "api-server"
    env_dir.mkdir(parents=True)
    (env_dir / ".env").write_text(
        "LUI_AGENT_PROVIDER=openai-compatible\n"
        "LUI_AGENT_BASE_URL=https://example.test/v1\n"
        "LUI_AGENT_MODEL_NAME=test-model\n"
    )
    monkeypatch.chdir(tmp_path)

    config = ProviderSettings()

    assert config.provider == "openai-compatible"
    assert config.base_url == "https://example.test/v1"
    assert config.model_name == "test-model"


@pytest.mark.asyncio
async def test_stream_adapter_emits_ordered_message_events() -> None:
    model = FakeChatModel(chunks=["你好", "，世界"])

    events = [
        event
        async for event in stream_graph_events(
            model,
            [{"role": "user", "content": "hi"}],
            run_id="run-1",
            thread_id="thread-1",
        )
    ]

    assert [event.event for event in events] == [
        "message.started",
        "message.delta",
        "message.delta",
        "message.completed",
    ]
    assert [event.sequence for event in events] == [1, 2, 3, 4]
    assert events[1].data["content"] == "你好"


@pytest.mark.asyncio
async def test_stream_adapter_maps_tool_call_without_server_runtime() -> None:
    model = FakeChatModel(
        response="",
        chunks=[],
        tool_calls=[{"name": "calculator", "args": {"expression": "2 + 2"}, "id": "call-1"}],
    )

    events = [
        event
        async for event in stream_graph_events(
            model,
            [{"role": "user", "content": "calculate"}],
            run_id="run-1",
            thread_id="thread-1",
        )
    ]

    assert events[0].event == "tool.call"
    assert events[0].data["tool"] == "calculator"


@pytest.mark.asyncio
async def test_stream_adapter_executes_langchain_tool_and_maps_result() -> None:
    @tool
    def calculator(expression: str) -> str:
        """计算表达式。"""
        return "4"

    model = FakeChatModel(
        response="",
        chunks=[],
        tool_calls=[{"name": "calculator", "args": {"expression": "2 + 2"}, "id": "call-1"}],
    )

    events = [
        event
        async for event in stream_graph_events(
            model,
            [{"role": "user", "content": "calculate"}],
            run_id="run-1",
            thread_id="thread-1",
            tools=[calculator],
        )
    ]

    assert [event.event for event in events] == ["tool.call", "tool.result"]
    assert events[1].data["content"] == "4"


@pytest.mark.asyncio
async def test_stream_adapter_does_not_execute_tool_requiring_approval() -> None:
    calls: list[str] = []

    @tool("mcp__srv__create_issue")
    def create_issue(title: str) -> str:
        """创建 issue。"""
        calls.append(title)
        return "created"

    model = FakeChatModel(
        response="",
        chunks=[],
        tool_calls=[
            {
                "name": "mcp__srv__create_issue",
                "args": {"title": "bug"},
                "id": "call-1",
            }
        ],
    )
    events = [
        event
        async for event in stream_graph_events(
            model,
            [{"role": "user", "content": "create"}],
            run_id="run-1",
            thread_id="thread-1",
            tools=[create_issue],
            approval_tool_names=frozenset({"mcp__srv__create_issue"}),
        )
    ]

    assert calls == []
    assert [event.event for event in events] == ["tool.approval_requested"]
    assert events[0].data["arguments"] == {"title": "bug"}


@pytest.mark.asyncio
async def test_reasoning_after_text_starts_a_new_message_segment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from lui_agent_runtime.graph import runtime

    class Chunk:
        def __init__(self, content: str = "", reasoning: str = "") -> None:
            self.content = content
            self.additional_kwargs = {"reasoning_content": reasoning} if reasoning else {}
            self.tool_call_chunks = []

    class Graph:
        async def astream_events(self, *_args, **_kwargs):
            for chunk in (
                Chunk(content="第一段"),
                Chunk(reasoning="再分析"),
                Chunk(content="第二段"),
            ):
                yield {"event": "on_chat_model_stream", "data": {"chunk": chunk}}

    monkeypatch.setattr(runtime, "create_streaming_graph", lambda *_args, **_kwargs: Graph())
    events = [
        event
        async for event in runtime.stream_graph_events(
            FakeChatModel(),
            [{"role": "user", "content": "hi"}],
            run_id="run-1",
            thread_id="thread-1",
        )
    ]

    assert [event.event for event in events] == [
        "message.started",
        "message.delta",
        "message.completed",
        "reasoning.delta",
        "reasoning.completed",
        "message.started",
        "message.delta",
        "message.completed",
    ]
    message_item_ids = [
        event.data["item_id"] for event in events if event.event == "message.started"
    ]
    assert message_item_ids == [
        "run-1:assistant:segment:0",
        "run-1:assistant:segment:1",
    ]
