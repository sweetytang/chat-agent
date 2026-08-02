import importlib.util

import pytest

pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("langgraph") is None,
    reason="LangGraph is installed by uv in the project environment",
)


@pytest.mark.asyncio
async def test_graph_uses_model_as_an_in_process_node() -> None:
    from app.graph.runtime import create_graph

    class FakeModel:
        async def ainvoke(self, messages):
            return {"role": "ai", "content": f"messages={len(messages)}"}

    result = await create_graph(FakeModel()).ainvoke({"messages": [{"role": "user", "content": "hi"}]})

    assert result["messages"][-1].content == "messages=1"
