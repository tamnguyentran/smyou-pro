"""Guard registry: guard name in spec/state_machines.yaml → pure function (ARCHITECTURE §6).

A guard moves from PENDING_GUARDS to GUARDS in the backlog item that implements it.
tests/generated/test_guards_implemented.py fails if a pending item is already done.
"""

import uuid
from collections.abc import Callable


def customer_present(
    customer_id: uuid.UUID | None, customer_name: str | None, customer_phone: str | None
) -> bool:
    return customer_id is not None or bool(customer_name and customer_phone)


def has_lines_or_description(line_count: int, work_description: str) -> bool:
    return line_count > 0 or bool(work_description.strip())


def service_address_present(service_address: str) -> bool:
    return bool(service_address.strip())


def order_has_no_tasks(task_count: int) -> bool:
    return task_count == 0


def reason_present(reason: str | None) -> bool:
    return reason is not None and len(reason.strip()) >= 5


GUARDS: dict[str, Callable[..., bool]] = {
    "customer_present": customer_present,
    "has_lines_or_description": has_lines_or_description,
    "service_address_present": service_address_present,
    "order_has_no_tasks": order_has_no_tasks,
    "reason_present": reason_present,
}

PENDING_GUARDS: dict[str, str] = {
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
