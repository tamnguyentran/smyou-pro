"""Pure guard functions with no dedicated command in M4-02a yet (M5 wires task_not_cancelled)."""

from datetime import UTC, datetime

import pytest

from app.modules.workflow.guards import (
    not_already_active_assignee,
    order_in_revision,
    revision_has_work_if_revision,
    task_not_cancelled,
)


def test_not_already_active_assignee() -> None:
    assert not_already_active_assignee(False) is True
    assert not_already_active_assignee(True) is False


def test_task_not_cancelled() -> None:
    assert task_not_cancelled(None) is True
    assert task_not_cancelled(datetime(2026, 10, 1, tzinfo=UTC)) is False


def test_order_in_revision() -> None:
    assert order_in_revision("REVISION") is True
    assert order_in_revision("AWAITING_CONFIRMATION") is False


@pytest.mark.ac("AC-DSP-118")
def test_revision_has_work_if_revision() -> None:
    assert revision_has_work_if_revision("REVISION", False) is False
    assert revision_has_work_if_revision("REVISION", True) is True
    assert revision_has_work_if_revision("AWAITING_CONFIRMATION", False) is True
