import pytest

from app.modules.runs.state import RunLifecycle, RunStatus, ThreadRunQueue


def test_run_lifecycle_supports_interrupt_and_resume() -> None:
    lifecycle = RunLifecycle()
    lifecycle.transition(RunStatus.RUNNING)
    lifecycle.transition(RunStatus.INTERRUPTED)
    lifecycle.transition(RunStatus.RESUMING)
    lifecycle.transition(RunStatus.RUNNING)
    lifecycle.transition(RunStatus.COMPLETED)

    assert lifecycle.status is RunStatus.COMPLETED


def test_terminal_run_cannot_be_reopened() -> None:
    lifecycle = RunLifecycle()
    lifecycle.transition(RunStatus.RUNNING)
    lifecycle.transition(RunStatus.FAILED)

    with pytest.raises(ValueError, match="Invalid run transition"):
        lifecycle.transition(RunStatus.RUNNING)


def test_thread_queue_is_fifo_and_cancel_does_not_clear_other_items() -> None:
    queue = ThreadRunQueue()
    assert queue.enqueue("run-1") is RunStatus.RUNNING
    assert queue.enqueue("run-2") is RunStatus.QUEUED
    assert queue.enqueue("run-3") is RunStatus.QUEUED
    assert queue.cancel("run-2") is True
    assert queue.finish_active() == "run-3"
