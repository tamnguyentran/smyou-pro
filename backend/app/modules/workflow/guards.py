"""Guard registry: guard name in spec/state_machines.yaml → pure function (ARCHITECTURE §6).

A guard moves from PENDING_GUARDS to GUARDS in the backlog item that implements it.
tests/generated/test_guards_implemented.py fails if a pending item is already done.
"""

from collections.abc import Callable

GUARDS: dict[str, Callable[..., bool]] = {}

PENDING_GUARDS: dict[str, str] = {
    # order submit / recall / cancel
    "customer_present": "M3-03",
    "has_lines_or_description": "M3-03",
    "service_address_present": "M3-03",
    "order_has_no_tasks": "M3-03",
    "reason_present": "M3-03",
    # dispatch: tasks & assignments
    "order_in_dispatchable_state": "M4-01",
    "at_least_one_assignee": "M4-01",
    "assignees_are_active_technicians": "M4-01",
    "estimated_hours_positive": "M4-01",
    "due_at_not_in_past": "M4-01",
    "not_already_active_assignee": "M4-02",
    "task_not_cancelled": "M4-02",
    # technician responses
    "reject_reason_code_present": "M5-02",
    "reject_reason_text_present": "M5-02",
    "has_active_tasks": "M5-03",
    "all_active_tasks_done": "M5-03",
    # completion & revision
    "confirmation_attachment_in_current_revision": "M6-02",
    "signer_name_present": "M6-02",
    "order_in_revision": "M6-03",
    "revision_has_work_if_revision": "M6-03",
}
