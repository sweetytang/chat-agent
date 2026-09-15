from __future__ import annotations

from lui_agent_runtime.events import RuntimeEvent


def build_event(
    run_id: str, thread_id: str, sequence: int, name: str, **data: object
) -> RuntimeEvent:
    return RuntimeEvent(1, name, run_id, thread_id, sequence, data)
