"""运行时的进程内并发与协调状态管理。"""

from __future__ import annotations

from typing import Any

import asyncio

from app.modules.runs.schemas import PendingReview


class RunCoordination:
    """管理运行过程中的进程内锁、取消信号和待审状态。

    单机多协程下使用内存对象；
    未来多实例分布式部署时，可将其对应方法平滑替换为 Redis Pub/Sub 与分布式锁。
    """

    def __init__(self) -> None:
        self._chat_locks: dict[str, asyncio.Lock] = {}
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._pending_reviews: dict[str, PendingReview] = {}

    # --- 线程锁 ---
    def setdefault_chat_lock(self, thread_id: str) -> asyncio.Lock:
        return self._chat_locks.setdefault(thread_id, asyncio.Lock())

    # --- 取消信号 ---
    @property
    def cancel_events(self) -> dict[str, asyncio.Event]:
        return self._cancel_events

    def register_cancel_event(self, run_id: str) -> asyncio.Event:
        event = asyncio.Event()
        self._cancel_events[run_id] = event
        return event

    def trigger_cancel(self, run_id: str) -> bool:
        if event := self._cancel_events.get(run_id):
            event.set()
            return True
        return False

    def is_cancel_requested(self, run_id: str) -> bool:
        """检查该 run 是否已被触发取消信号。若未注册或未触发均返回 False。"""
        event = self._cancel_events.get(run_id)
        return event.is_set() if event is not None else False

    def remove_cancel_event(self, run_id: str) -> None:
        self._cancel_events.pop(run_id, None)

    # --- 待审批状态 ---
    @property
    def pending_reviews(self) -> dict[str, Any]:
        return self._pending_reviews

    def get_pending_review(self, request_id: str) -> PendingReview | None:
        return self._pending_reviews.get(request_id, None)

    def register_pending_review(self, request_id: str, review: PendingReview):
        self._pending_reviews[request_id] = review

    def remove_pending_review(self, request_id: str) -> PendingReview | None:
        return self._pending_reviews.pop(request_id, None)


# 进程内单例
run_coordination = RunCoordination()

__all__ = ["run_coordination"]
