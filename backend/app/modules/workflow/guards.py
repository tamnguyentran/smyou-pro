"""Guard registry: guard name in spec/state_machines.yaml → pure function (ARCHITECTURE §6).

A guard moves from PENDING_GUARDS to GUARDS in the backlog item that implements it.
tests/generated/test_guards_implemented.py fails if a pending item is already done.
"""

import uuid
from collections.abc import Callable, Sequence
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


# Mirrors spec/state_machines.yaml#reject_reason_codes (= dispatch.models.REJECT_REASON_CODES) — not
# imported from there to keep this module free of feature-module dependencies (same pure-function
# spirit as the rest of the file); the pydantic schema layer already enforces this set with a 422
# before the service ever reaches this guard (AC-ASG-029), so in practice it is only exercised here
# for name parity with the YAML.
_REJECT_REASON_CODES = ("BUSY", "SICK", "SKILL", "DISTANCE", "OTHER")


def reject_reason_code_present(reason_code: str | None) -> bool:
    return reason_code in _REJECT_REASON_CODES


def reject_reason_text_present(reason_text: str | None) -> bool:
    return reason_text is not None and len(reason_text.strip()) >= 5


def has_active_tasks(active_task_count: int) -> bool:
    return active_task_count >= 1


def all_active_tasks_done(active_task_statuses: Sequence[str]) -> bool:
    return len(active_task_statuses) > 0 and all(s == "DONE" for s in active_task_statuses)


def confirmation_attachment_in_current_revision(has_attachment: bool) -> bool:
    return has_attachment


def signer_name_present(signer_name: str | None) -> bool:
    return signer_name is not None and len(signer_name.strip()) > 0


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
    "reject_reason_code_present": reject_reason_code_present,
    "reject_reason_text_present": reject_reason_text_present,
    "has_active_tasks": has_active_tasks,
    "all_active_tasks_done": all_active_tasks_done,
    "confirmation_attachment_in_current_revision": confirmation_attachment_in_current_revision,
    "signer_name_present": signer_name_present,
}

PENDING_GUARDS: dict[str, str] = {
    # completion & revision
    "order_in_revision": "M6-03",
    "revision_has_work_if_revision": "M6-03",
}
