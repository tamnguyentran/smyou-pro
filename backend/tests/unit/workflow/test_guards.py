"""Pure guard functions with no dedicated command in M4-02a yet (M5 wires task_not_cancelled)."""

from datetime import UTC, datetime

from app.modules.workflow.guards import not_already_active_assignee, task_not_cancelled


def test_not_already_active_assignee() -> None:
    assert not_already_active_assignee(False) is True
    assert not_already_active_assignee(True) is False


def test_task_not_cancelled() -> None:
    assert task_not_cancelled(None) is True
    assert task_not_cancelled(datetime(2026, 10, 1, tzinfo=UTC)) is False
