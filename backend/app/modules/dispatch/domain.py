"""Pure task rules: code gen, origin, derived status (DOMAIN_MODEL §8, M4-01a). No framework imports."""

from collections.abc import Sequence

from app.core.spec_loader import TaskCommand, TaskMachine

# Assignment statuses excluded when deriving task status (spec/state_machines.yaml#task.derived_status
# talks about "active" assignments — rejected/removed ones no longer count).
_INACTIVE_ASSIGNMENT_STATUSES = ("REJECTED", "REMOVED")


def find_task_command(machine: TaskMachine, command: str) -> TaskCommand:
    for c in machine.commands:
        if c.command == command:
            return c
    raise AssertionError(f"unknown task command: {command!r}")  # routes only ever pass known commands


def task_code(order_code: str, sequence: int) -> str:
    return f"{order_code}-T{sequence}"


def origin_for(order_status: str) -> str:
    """spec/state_machines.yaml#task.commands[create].origin: "INITIAL if order not in REVISION,
    else ADDITIONAL"."""
    return "ADDITIONAL" if order_status == "REVISION" else "INITIAL"


def derive_task_status(assignment_statuses: Sequence[str], *, cancelled: bool) -> str:
    """spec/state_machines.yaml#task.derived_status — evaluated top-down, first match wins."""
    if cancelled:
        return "CANCELLED"
    active = [s for s in assignment_statuses if s not in _INACTIVE_ASSIGNMENT_STATUSES]
    if not active:
        return "NEEDS_ASSIGNEE"
    if all(s == "DONE" for s in active):
        return "DONE"
    if any(s in ("IN_PROGRESS", "DONE") for s in active):
        return "IN_PROGRESS"
    if any(s == "PENDING" for s in active):
        return "PENDING_ACCEPTANCE"
    return "ACCEPTED"
