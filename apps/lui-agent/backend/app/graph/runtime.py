from collections.abc import AsyncIterator, Awaitable, Sequence
from typing import Any, Protocol

from langchain_core.messages import AIMessage, BaseMessage
from langgraph.graph import END, START, MessagesState, StateGraph

try:
    from langgraph.prebuilt import ToolNode
except ImportError:
    ToolNode = None

from app.common.events import BusinessEvent


class ChatModel(Protocol):
    def ainvoke(self, messages: list[Any]) -> Awaitable[Any]: ...

    def astream(self, messages: list[Any]) -> Any: ...


def create_graph(model: ChatModel, tools: Sequence[Any] = ()):
    """创建最小消息图；FastAPI/application service 负责外部事件和持久化。"""

    async def call_model(state: MessagesState) -> dict[str, list[Any]]:
        response = await (model.bind_tools(list(tools)) if tools else model).ainvoke(
            state["messages"]
        )
        return {"messages": [response]}

    graph = StateGraph(MessagesState)
    graph.add_node("call_model", call_model)
    graph.add_edge(START, "call_model")
    if tools:
        if ToolNode is None:
            return graph.compile()
        graph.add_node("tools", ToolNode(list(tools)))
        graph.add_conditional_edges(
            "call_model",
            lambda state: "tools" if getattr(state["messages"][-1], "tool_calls", None) else END,
        )
        graph.add_edge("tools", END)
    else:
        graph.add_edge("call_model", END)
    return graph.compile()


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(
            _text(item.get("text", "") if isinstance(item, dict) else item) for item in value
        )
    return ""


def _event(run_id: str, thread_id: str, sequence: int, name: str, **data: Any) -> BusinessEvent:
    return BusinessEvent(1, name, run_id, thread_id, sequence, data)


async def stream_graph_events(
    model: ChatModel,
    messages: Sequence[BaseMessage | dict[str, Any]],
    *,
    run_id: str,
    thread_id: str,
    tools: Sequence[Any] = (),
    continue_after_tools: bool = False,
) -> AsyncIterator[BusinessEvent]:
    """把进程内 LangGraph 事件转换为稳定的业务事件。"""

    if tools and ToolNode is None:
        response = await model.ainvoke(list(messages))
        sequence = 0
        for call in getattr(response, "tool_calls", None) or []:
            sequence += 1
            yield _event(
                run_id,
                thread_id,
                sequence,
                "tool.call",
                tool=call["name"],
                tool_call_id=call.get("id"),
                arguments=call.get("args", {}),
            )
            selected = next(
                (tool for tool in tools if getattr(tool, "name", None) == call["name"]), None
            )
            if selected is not None:
                output = selected.invoke(call.get("args", {}))
                sequence += 1
                yield _event(
                    run_id, thread_id, sequence, "tool.result", tool=call["name"], content=output
                )
        return

    graph = create_streaming_graph(model, tools=tools, continue_after_tools=continue_after_tools)
    sequence = 0
    message_started = False
    reasoning_started = False
    async for item in graph.astream_events({"messages": list(messages)}, version="v2"):
        kind = item.get("event", "")
        data = item.get("data") or {}
        chunk = data.get("chunk")
        if kind == "on_chat_model_stream" and chunk is not None:
            content = _text(getattr(chunk, "content", ""))
            additional = getattr(chunk, "additional_kwargs", {}) or {}
            reasoning = additional.get("reasoning_content") or additional.get("reasoning")
            if reasoning:
                reasoning_started = True
                sequence += 1
                yield _event(run_id, thread_id, sequence, "reasoning.delta", content=reasoning)
            if content:
                if not message_started:
                    message_started = True
                    sequence += 1
                    yield _event(run_id, thread_id, sequence, "message.started", role="assistant")
                sequence += 1
                yield _event(run_id, thread_id, sequence, "message.delta", content=content)
            for call in getattr(chunk, "tool_call_chunks", None) or []:
                if tools:
                    continue
                if call.get("name"):
                    sequence += 1
                    tool_name = call["name"]
                    if tool_name == "present_structured_answer":
                        event_name = "structured_output.delta"
                    elif tool_name == "present_generative_ui":
                        event_name = "generative_ui.delta"
                    else:
                        event_name = "tool.call"
                    yield _event(
                        run_id,
                        thread_id,
                        sequence,
                        event_name,
                        tool=tool_name,
                        tool_call_id=call.get("id"),
                        arguments=call.get("args", {}),
                    )
        elif kind == "on_tool_start":
            sequence += 1
            yield _event(
                run_id,
                thread_id,
                sequence,
                "tool.call",
                tool=item.get("name", "tool"),
                arguments=data.get("input", {}),
            )
        elif kind == "on_tool_end":
            sequence += 1
            output = data.get("output")
            output = getattr(output, "content", output)
            yield _event(
                run_id,
                thread_id,
                sequence,
                "tool.result",
                tool=item.get("name", "tool"),
                content=output,
            )

    if reasoning_started:
        sequence += 1
        yield _event(run_id, thread_id, sequence, "reasoning.completed")
    if message_started:
        sequence += 1
        yield _event(run_id, thread_id, sequence, "message.completed")


def create_streaming_graph(
    model: ChatModel,
    tools: Sequence[Any] = (),
    *,
    continue_after_tools: bool = False,
):
    """创建使用模型 ``astream`` 的 LangGraph 图，供事件适配器消费。"""

    async def call_model(state: MessagesState) -> dict[str, list[Any]]:
        response: AIMessage | None = None
        stream_model = model.bind_tools(list(tools)) if tools else model
        async for chunk in stream_model.astream(state["messages"]):
            response = chunk if response is None else response + chunk
        return {"messages": [response or AIMessage(content="")]}

    graph = StateGraph(MessagesState)
    graph.add_node("call_model", call_model)
    graph.add_edge(START, "call_model")
    if tools:
        if ToolNode is None:
            return graph.compile()
        graph.add_node("tools", ToolNode(list(tools)))
        graph.add_conditional_edges(
            "call_model",
            lambda state: "tools" if getattr(state["messages"][-1], "tool_calls", None) else END,
        )
        graph.add_edge("tools", "call_model" if continue_after_tools else END)
    else:
        graph.add_edge("call_model", END)
    return graph.compile()
