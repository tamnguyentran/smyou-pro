"""M4-01a pure task rules (task code, origin, derived status)."""

from app.modules.dispatch.domain import derive_task_status, origin_for, task_code


def test_task_code_format() -> None:
    assert task_code("DH2609-0035", 1) == "DH2609-0035-T1"
    assert task_code("DH2609-0035", 2) == "DH2609-0035-T2"


def test_origin_for_initial_unless_revision() -> None:
    assert origin_for("PENDING_DISPATCH") == "INITIAL"
    assert origin_for("IN_PROGRESS") == "INITIAL"
    assert origin_for("REVISION") == "ADDITIONAL"


def test_derive_task_status_cancelled_wins() -> None:
    assert derive_task_status(["DONE", "DONE"], cancelled=True) == "CANCELLED"


def test_derive_task_status_no_active_assignments() -> None:
    assert derive_task_status([], cancelled=False) == "NEEDS_ASSIGNEE"
    assert derive_task_status(["REJECTED", "REMOVED"], cancelled=False) == "NEEDS_ASSIGNEE"


def test_derive_task_status_all_done() -> None:
    assert derive_task_status(["DONE", "DONE"], cancelled=False) == "DONE"


def test_derive_task_status_any_in_progress_or_done() -> None:
    assert derive_task_status(["PENDING", "IN_PROGRESS"], cancelled=False) == "IN_PROGRESS"
    assert derive_task_status(["ACCEPTED", "DONE"], cancelled=False) == "IN_PROGRESS"


def test_derive_task_status_any_pending() -> None:
    assert derive_task_status(["ACCEPTED", "PENDING"], cancelled=False) == "PENDING_ACCEPTANCE"


def test_derive_task_status_all_accepted() -> None:
    assert derive_task_status(["ACCEPTED", "ACCEPTED"], cancelled=False) == "ACCEPTED"
