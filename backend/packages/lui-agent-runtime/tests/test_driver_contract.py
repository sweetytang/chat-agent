from collections.abc import AsyncIterator

import pytest

from lui_agent_runtime.driver import LangGraphAgentDriver
from lui_agent_runtime.events import RuntimeEvent, encode_sse


@pytest.mark.asyncio
async def test_langgraph_driver_forwards_runtime_events() -> None:
    async def fake_stream(*_args, **_kwargs) -> AsyncIterator[RuntimeEvent]:
        yield RuntimeEvent(1, "message.delta", "run-1", "thread-1", 0, {"content": "ok"})

    driver = LangGraphAgentDriver(fake_stream)
    events = [
        event async for event in driver.stream(object(), [], run_id="run-1", thread_id="thread-1")
    ]

    assert events == [RuntimeEvent(1, "message.delta", "run-1", "thread-1", 0, {"content": "ok"})]
    assert not isinstance(events[0], RuntimeEvent)


def test_business_event_keeps_legacy_sse_payload() -> None:
    event = RuntimeEvent(1, "run.started", "run-1", "thread-1", 0, {})

    assert event.to_sse() == encode_sse(event)
    assert (
        event.to_sse()
        == 'event: run.started\ndata: {"version":1,"event":"run.started","run_id":"run-1","thread_id":"thread-1","sequence":0,"data":{}}\n\n'
    )
