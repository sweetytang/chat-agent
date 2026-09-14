from __future__ import annotations

from collections.abc import Callable
from time import monotonic

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Checkpoint
from app.modules.runs.domain import build_event
from .domain import reduce_timeline
from .domain import checkpoint_timeline, empty_timeline, TimelineSnapshot
from lui_agent_runtime.events import RuntimeEvent


class TimelineRecorder:
    """运行事件进入 checkpoint 时间线的唯一入口。"""

    def __init__(
        self,
        *,
        event_factory: Callable[..., RuntimeEvent] | None = None,
        checkpoint: Checkpoint | None = None,
        session: AsyncSession | None = None,
    ) -> None:
        self.event_factory = event_factory if event_factory is not None else build_event
        self.snapshot = checkpoint_timeline(checkpoint) if checkpoint is not None else empty_timeline()
        self.checkpoint = checkpoint
        self.session = session
        self._dirty_events = 0
        self._force_flush = False
        self._last_flush = monotonic()

    def record(
        self,
        run_id: str,
        thread_id: str,
        sequence: int,
        event_name: str,
        **data: object,
    ) -> RuntimeEvent:
        event = self.event_factory(run_id, thread_id, sequence, event_name, **data)
        self.snapshot = reduce_timeline(self.snapshot, event)
        if self.checkpoint is not None:
            self.checkpoint.state = {"timeline": self.snapshot}
            self._dirty_events += 1
            self._force_flush = self._force_flush or event_name not in {
                "message.delta",
                "reasoning.delta",
                "structured_output.delta",
                "generative_ui.delta",
            }
        return event

    async def flush_if_due(self) -> None:
        if not self._dirty_events:
            return
        if self._force_flush or self._dirty_events >= 16 or monotonic() - self._last_flush >= 0.05:
            await self.flush()

    async def flush(self) -> None:
        if self.session is not None:
            await self.session.commit()
        self._dirty_events = 0
        self._force_flush = False
        self._last_flush = monotonic()
