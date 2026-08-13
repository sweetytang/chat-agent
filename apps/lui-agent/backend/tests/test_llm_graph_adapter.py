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
