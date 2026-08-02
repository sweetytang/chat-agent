import pytest

from app.graph.events import stream_graph_events
from app.graph.runtime import create_graph
from app.integrations.llm.fake import FakeChatModel


@pytest.mark.asyncio
async def test_graph_updates_are_mapped_to_business_events() -> None:
    events = [event async for event in stream_graph_events(create_graph(FakeChatModel()), "thread-1", "hi")]

    assert [event.event for event in events] == ["run.started", "message.delta", "run.completed"]
    assert events[1].data["content"] == "收到你的消息。"
