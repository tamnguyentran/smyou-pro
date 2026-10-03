"""Guard registry: guard name in spec/state_machines.yaml → pure function (ARCHITECTURE §6).

A guard moves from PENDING_GUARDS to GUARDS in the backlog item that implements it.
tests/generated/test_guards_implemented.py fails if a pending item is already done.
"""

import uuid
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal


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


def order_in_dispatchable_state(order_status: str) -> bool:
    # REVISION included: task.commands[create].origin ("INITIAL if order not in REVISION, else
    # ADDITIONAL") presupposes a task can be created while the order is in REVISION.
    return order_status in ("PENDING_DISPATCH", "IN_PROGRESS", "REVISION")


def at_least_one_assignee(assignee_count: int) -> bool:
    return assignee_count >= 1


def assignees_are_active_technicians(valid_technician_count: int, requested_count: int) -> bool:
    return requested_count > 0 and valid_technician_count == requested_count


def estimated_hours_positive(hours: Decimal) -> bool:
    return Decimal(0) < hours <= Decimal(200) and (hours * 100) % 25 == 0


def due_at_not_in_past(due_at: datetime, now: datetime) -> bool:
    return due_at >= now


def not_already_active_assignee(already_active: bool) -> bool:
    return not already_active


def task_not_cancelled(cancelled_at: datetime | None) -> bool:
    return cancelled_at is None


GUARDS: dict[str, Callable[..., bool]] = {
    "customer_present": customer_present,
    "has_lines_or_description": has_lines_or_description,
    "service_address_present": service_address_present,
    "order_has_no_tasks": order_has_no_tasks,
    "reason_present": reason_present,
    "order_in_dispatchable_state": order_in_dispatchable_state,
    "at_least_one_assignee": at_least_one_assignee,
    "assignees_are_active_technicians": assignees_are_active_technicians,
    "estimated_hours_positive": estimated_hours_positive,
    "due_at_not_in_past": due_at_not_in_past,
    "not_already_active_assignee": not_already_active_assignee,
    "task_not_cancelled": task_not_cancelled,
}

PENDING_GUARDS: dict[str, str] = {
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
