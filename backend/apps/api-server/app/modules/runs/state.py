from dataclasses import dataclass, field
from enum import StrEnum


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    INTERRUPTED = "interrupted"
    RESUMING = "resuming"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


_TRANSITIONS: dict[RunStatus, frozenset[RunStatus]] = {
    RunStatus.QUEUED: frozenset({RunStatus.RUNNING, RunStatus.CANCELLED}),
    RunStatus.RUNNING: frozenset(
        {RunStatus.INTERRUPTED, RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
    ),
    RunStatus.INTERRUPTED: frozenset({RunStatus.RESUMING, RunStatus.CANCELLED, RunStatus.FAILED}),
    RunStatus.RESUMING: frozenset({RunStatus.RUNNING, RunStatus.FAILED, RunStatus.CANCELLED}),
    RunStatus.COMPLETED: frozenset(),
    RunStatus.FAILED: frozenset(),
    RunStatus.CANCELLED: frozenset(),
}


@dataclass
class RunLifecycle:
    status: RunStatus = RunStatus.QUEUED
    history: list[RunStatus] = field(default_factory=lambda: [RunStatus.QUEUED])

    def transition(self, next_status: RunStatus) -> None:
        if next_status not in _TRANSITIONS[self.status]:
            raise ValueError(f"Invalid run transition: {self.status} -> {next_status}")
        self.status = next_status
        self.history.append(next_status)


@dataclass
class ThreadRunQueue:
    """每个 thread 只允许一个 active run，其余 run 按创建顺序排队。"""

    active_run_id: str | None = None
    queued_run_ids: list[str] = field(default_factory=list)

    def enqueue(self, run_id: str) -> RunStatus:
        if self.active_run_id is None:
            self.active_run_id = run_id
            return RunStatus.RUNNING
        self.queued_run_ids.append(run_id)
        return RunStatus.QUEUED

    def cancel(self, run_id: str) -> bool:
        if run_id == self.active_run_id:
            return False
        if run_id in self.queued_run_ids:
            self.queued_run_ids.remove(run_id)
            return True
        return False

    def finish_active(self) -> str | None:
        self.active_run_id = self.queued_run_ids.pop(0) if self.queued_run_ids else None
        return self.active_run_id
