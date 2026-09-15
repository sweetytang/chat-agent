from app.modules.timeline.domain.reducer import reduce_timeline
from app.modules.timeline.recorder import TimelineRecorder
from app.modules.timeline.domain import empty_timeline, extract_conversation_messages
from lui_agent_runtime.events import RuntimeEvent


def event(sequence: int, name: str, **data: object) -> RuntimeEvent:
    return RuntimeEvent(1, name, "run-1", "thread-1", sequence, data)


def test_interleaved_events_keep_semantic_order_and_stable_items() -> None:
    snapshot = empty_timeline()
    events = [
        event(1, "reasoning.delta", item_id="reasoning-1", content="分析"),
        event(2, "reasoning.completed", item_id="reasoning-1"),
        event(3, "message.started", item_id="segment-1", message_id="message-1", role="assistant"),
        event(4, "message.delta", item_id="segment-1", content="先查询"),
        event(5, "message.completed", item_id="segment-1"),
        event(6, "tool.call", tool_call_id="call-1", tool="search", arguments={}),
        event(7, "tool.result", tool_call_id="call-1", tool="search", content={"ok": True}),
        event(8, "message.started", item_id="segment-2", message_id="message-1", role="assistant"),
        event(9, "message.delta", item_id="segment-2", content="查询完成"),
        event(10, "message.completed", item_id="segment-2"),
    ]
    for item in events:
        snapshot = reduce_timeline(snapshot, item)

    assert [item["id"] for item in snapshot["items"]] == [
        "reasoning-1",
        "segment-1",
        "call-1",
        "segment-2",
    ]
    assert snapshot["items"][2]["status"] == "completed"
    assert extract_conversation_messages(snapshot) == [
        {"role": "assistant", "content": "先查询查询完成"}
    ]


def test_multiple_same_kind_items_are_not_overwritten() -> None:
    snapshot = empty_timeline()
    for sequence, call_id in enumerate(("call-1", "call-2"), start=1):
        snapshot = reduce_timeline(
            snapshot,
            event(sequence, "tool.call", tool_call_id=call_id, tool="search", arguments={}),
        )

    assert [item["id"] for item in snapshot["items"]] == ["call-1", "call-2"]


def test_recorder_uses_latest_checkpoint_state_when_resume_context_is_stale() -> None:
    checkpoint = type(
        "Checkpoint",
        (),
        {
            "state": {
                "timeline": {
                    "version": 1,
                    "items": [
                        {
                            "id": "call-1",
                            "kind": "tool",
                            "run_id": "run-1",
                            "sequence": 3,
                            "tool": "search",
                            "arguments": {},
                            "request_id": "request-1",
                            "result": None,
                            "status": "awaiting_approval",
                        }
                    ],
                }
            }
        },
    )()
    recorder = TimelineRecorder(
        event_factory=lambda run_id, thread_id, sequence, name, **data: RuntimeEvent(
            1, name, run_id, thread_id, sequence, data
        ),
        snapshot=empty_timeline(),
        checkpoint=checkpoint,
    )

    recorder.record(
        "run-1",
        "thread-1",
        4,
        "tool.result",
        tool_call_id="call-1",
        content={"ok": True},
    )

    assert len(recorder.snapshot["items"]) == 1
    assert recorder.snapshot["items"][0]["id"] == "call-1"
    assert recorder.snapshot["items"][0]["status"] == "completed"


def test_failed_run_finishes_all_unfinished_items_before_appending_error() -> None:
    snapshot = empty_timeline()
    for item in (
        event(1, "message.started", item_id="message-1", message_id="logical-1"),
        event(2, "reasoning.delta", item_id="reasoning-1", content="分析"),
        event(3, "tool.call", tool_call_id="call-1", tool="search", arguments={}),
        event(4, "structured_output.delta", item_id="structured-1", value={"ok": True}),
    ):
        snapshot = reduce_timeline(snapshot, item)

    snapshot = reduce_timeline(snapshot, event(5, "run.failed", error="运行失败"))

    assert [item["status"] for item in snapshot["items"][:-1]] == [
        "failed",
        "failed",
        "failed",
        "failed",
    ]
    assert snapshot["items"][-1]["kind"] == "error"
