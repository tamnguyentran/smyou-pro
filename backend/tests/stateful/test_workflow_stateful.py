"""AC-SYS-093/AC-SYS-094/AC-SYS-095 — property-based test over the 3 workflow state machines
(spec/state_machines.yaml). `WorkflowMachine` fires random sequences of every explicit-actor
command through the service layer (no HTTP, real Postgres) and checks the 8 documented invariants
after each step.

`order.cancel_active` has no rule: no router/service path can ever fire it today — `cancel_order()`
always looks up the transition literally named `"cancel"`, and no endpoint is wired to the
`order.cancel_active` capability either (see docs/product/OPEN_QUESTIONS.md Q76). 15 of the 16
commands AC-SYS-093 enumerates get a rule; this is a pre-existing product gap, not fixed here.

Two extra rules exist purely to set up realistic preconditions and are NOT one of the YAML
commands: `create_order` (orders start life via `order.create`, which is not a state-machine
*transition* — DRAFT is the machine's `initial:` state) and `upload_confirmation_attachment`
(the M6-01 attachment pipeline is a separate capability outside these 3 machines; without it,
`order.complete` could never pass its `confirmation_attachment_in_current_revision` guard and the
test would never reach COMPLETED).
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from hypothesis import settings
from hypothesis import strategies as st
from hypothesis.stateful import Bundle, RuleBasedStateMachine, invariant, multiple, precondition, rule
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.core.authz import Actor, effective_scopes
from app.core.errors import AppError
from app.core.spec_loader import load_specs
from app.modules.assignments import service as assignments_service
from app.modules.assignments.schemas import (
    AssignmentAccept,
    AssignmentComplete,
    AssignmentReject,
    AssignmentStart,
)
from app.modules.audit.models import AuditEvent
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import Assignment, Task
from app.modules.dispatch.schemas import (
    TaskAddAssignee,
    TaskAssigneeRemove,
    TaskCancel,
    TaskCreate,
    TaskReopen,
    TaskUpdate,
)
from app.modules.files.models import Attachment
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order
from app.modules.orders.schemas import OrderCancel, OrderCommand, OrderComplete, OrderCreate, OrderRevise
from tests.conftest import TEST_DATABASE_URL
from tests.integration.conftest import Person, seed
from tests.spec_fixtures import REPO_SPEC_DIR

# Previous-cycle/removed assignments never count toward "active" (spec/state_machines.yaml#task —
# same tuple as dispatch/service.py:_INACTIVE_ASSIGNMENT_STATUSES, duplicated here to keep this
# test free of private-name imports).
_INACTIVE_ASSIGNMENT_STATUSES = ("REJECTED", "REMOVED")
_EXPECTED_ERROR_CODES = frozenset({"GUARD_FAILED", "INVALID_TRANSITION", "STALE_VERSION"})

SPECS = load_specs(REPO_SPEC_DIR)
_HOURS = [Decimal(v) / 4 * Decimal(1) for v in (1, 2, 4, 8, 16)]  # 0.25/0.5/1/2/4 — valid steps


def _derive_task_status(statuses: list[str], *, cancelled: bool) -> str:
    """Mirrors app.modules.dispatch.domain.derive_task_status (AC-SYS-094 invariant #3) without
    importing a private domain helper under a different test's name."""
    if cancelled:
        return "CANCELLED"
    if not statuses:
        return "NEEDS_ASSIGNEE"
    if all(s == "DONE" for s in statuses):
        return "DONE"
    if any(s in ("IN_PROGRESS", "DONE") for s in statuses):
        return "IN_PROGRESS"
    if any(s == "PENDING" for s in statuses):
        return "PENDING_ACCEPTANCE"
    return "ACCEPTED"


def _make_actor(employee_id: uuid.UUID, role: str, capability: str) -> Actor:
    scopes = effective_scopes(SPECS.permissions, frozenset({role}), capability)
    return Actor(id=employee_id, roles=frozenset({role}), must_change_password=False, scopes=scopes)


def _pick_assignment_by_status(session, statuses: tuple[str, ...], index: int) -> Assignment | None:
    """Picks one assignment with any of `statuses`, in its task's *current* cycle, across ALL
    tasks/orders — by position (mod length), so a random `index` almost always hits a real row.
    `accept`/`reject`/`start`/`complete`/`remove` act on an *existing* assignment; picking globally
    by status (rather than drawing a `task` from a bundle first) avoids diluting the odds of
    advancing one specific assignment through its lifecycle across the fixed 25-step budget with
    "which of up to 3 live tasks" as an extra, irrelevant draw (AC-SYS-095 needs accept→start→
    complete to chain reliably within that budget)."""
    rows = session.scalars(
        select(Assignment)
        .join(Task, Task.id == Assignment.task_id)
        .where(Assignment.status.in_(statuses), Assignment.cycle == Task.cycle)
        .order_by(Assignment.created_at.asc())
    ).all()
    if not rows:
        return None
    return rows[index % len(rows)]


orders = Bundle("orders")
tasks = Bundle("tasks")


@settings(max_examples=50, stateful_step_count=25, deadline=None, database=None)
class WorkflowMachine(RuleBasedStateMachine):
    """AC-SYS-093: every explicit-actor command of order/task/assignment (minus `cancel_active`,
    see module docstring) + AC-SYS-094's 8 invariants."""

    def __init__(self) -> None:
        super().__init__()
        self.engine = create_engine(TEST_DATABASE_URL)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.session_factory = sessionmaker(
            bind=self.connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        self._transition_audit_count = 0
        self._seen_revision_no: dict[uuid.UUID, int] = {}
        self._seen_cycle: dict[uuid.UUID, int] = {}
        self._seq = 0

        sale_id = seed(
            self.connection, Person("sale@stateful.test", "x", ("SALE",), self._code(), "Sale", "SALES")
        )
        lead_id = seed(
            self.connection,
            Person("lead@stateful.test", "x", ("TECH_LEAD",), self._code(), "Lead", "TECHNICAL"),
        )
        self.sale_actor = _make_actor(sale_id, "SALE", "order.create")
        self.sale_actor_submit = _make_actor(sale_id, "SALE", "order.submit")
        self.sale_actor_cancel = _make_actor(sale_id, "SALE", "order.cancel")
        self.lead_actor_task = _make_actor(lead_id, "TECH_LEAD", "task.manage")
        self.lead_actor_reopen = _make_actor(lead_id, "TECH_LEAD", "task.reopen")
        self.lead_actor_revise = _make_actor(lead_id, "TECH_LEAD", "order.revise")
        self.lead_actor_complete = _make_actor(lead_id, "TECH_LEAD", "order.complete")
        self.technician_ids = [
            seed(
                self.connection,
                Person(
                    f"tech{i}@stateful.test", "x", ("TECHNICIAN",), self._code(), f"Tech {i}", "TECHNICAL"
                ),
            )
            for i in range(3)
        ]

    def _code(self) -> str:
        self._seq += 1
        return f"STF{self._seq:03d}{uuid.uuid4().hex[:4]}"

    def teardown(self) -> None:
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _expect_rejected(self, err: AppError) -> None:
        if err.code not in _EXPECTED_ERROR_CODES:
            raise

    def _exists_order_with_status(self, statuses: tuple[str, ...]) -> bool:
        """Same reasoning as _exists_assignment_with_status — order-level rules need this too, or
        a few "dispatchable state" guard failures (e.g. attempting create_task on a DRAFT/CANCELLED
        order) dominate the step budget and starve the later assignment-lifecycle rules."""
        with self.session_factory() as session:
            return (
                session.scalar(select(func.count()).select_from(Order).where(Order.status.in_(statuses))) or 0
            ) > 0

    def _live_order_count(self) -> int:
        """Orders not yet CANCELLED — caps `create_order` on *live* orders, not the bundle's total
        historical size, or once all 3 ever created happen to end up CANCELLED the machine is stuck
        with no rule eligible (InvalidDefinition: no rule had a True precondition)."""
        with self.session_factory() as session:
            return (
                session.scalar(select(func.count()).select_from(Order).where(Order.status != "CANCELLED"))
                or 0
            )

    def _live_task_count(self) -> int:
        with self.session_factory() as session:
            return (
                session.scalar(select(func.count()).select_from(Task).where(Task.cancelled_at.is_(None))) or 0
            )

    def _exists_assignment_with_status(self, statuses: tuple[str, ...]) -> bool:
        """Lets @precondition skip an assignment-transition rule when it would surely no-op —
        without this, 17 equally-likely rules competing for 25 steps/example almost never chain
        accept→start→complete on the same row (AC-SYS-095 needs that chain to be found reliably)."""
        with self.session_factory() as session:
            n = session.scalar(
                select(func.count()).select_from(Assignment).where(Assignment.status.in_(statuses))
            )
            return (n or 0) > 0

    # --- orders bundle setup (not a YAML transition — DRAFT is the machine's initial state) -----

    @precondition(lambda self: self._live_order_count() < 3)
    @rule(target=orders)
    def create_order(self) -> object:
        with self.session_factory() as session, session.begin():
            body = OrderCreate(
                customer_name="KH Stateful",
                customer_phone="0900000000",
                service_address="123 Duong Test",
                work_description="Viec test thuoc tinh",
            )
            detail = orders_service.create_order(session, self.sale_actor, body, now=self._now(), specs=SPECS)
            return detail.id

    @precondition(lambda self: self._exists_order_with_status(("AWAITING_CONFIRMATION", "REVISION")))
    @rule(order_id=orders)
    def upload_confirmation_attachment(self, order_id: uuid.UUID) -> None:
        """Setup helper (not a YAML command) — see module docstring."""
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None or order.status not in ("AWAITING_CONFIRMATION", "REVISION"):
                return
            session.add(
                Attachment(
                    owner_type="ORDER",
                    owner_id=order.id,
                    kind="CUSTOMER_CONFIRMATION",
                    revision_no=order.revision_no,
                    storage_key=f"stateful/{uuid.uuid4().hex}.jpg",
                    original_filename="confirm.jpg",
                    mime_type="image/jpeg",
                    size_bytes=1024,
                    sha256=uuid.uuid4().hex * 2,
                    uploaded_by=self.lead_actor_complete.id,
                )
            )

    # --- order transitions (AC-SYS-093) ----------------------------------------------------------

    @precondition(lambda self: self._exists_order_with_status(("DRAFT",)))
    @rule(order_id=orders)
    def submit_order(self, order_id: uuid.UUID) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None:
                return
            try:
                orders_service.submit_order(
                    session,
                    self.sale_actor_submit,
                    order_id,
                    OrderCommand(version=order.version),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_order_with_status(("PENDING_DISPATCH",)))
    @rule(order_id=orders)
    def recall_order(self, order_id: uuid.UUID) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None:
                return
            try:
                orders_service.recall_order(
                    session,
                    self.sale_actor_submit,
                    order_id,
                    OrderCommand(version=order.version),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_order_with_status(("DRAFT", "PENDING_DISPATCH")))
    @rule(order_id=orders)
    def cancel_order(self, order_id: uuid.UUID) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None:
                return
            try:
                orders_service.cancel_order(
                    session,
                    self.sale_actor_cancel,
                    order_id,
                    OrderCancel(version=order.version, reason="Huy don test thuoc tinh"),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_order_with_status(("AWAITING_CONFIRMATION",)))
    @rule(order_id=orders)
    def complete_order(self, order_id: uuid.UUID) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None:
                return
            try:
                orders_service.complete_order(
                    session,
                    self.lead_actor_complete,
                    order_id,
                    OrderComplete(version=order.version, confirmation_signer_name="Khach Stateful"),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_order_with_status(("AWAITING_CONFIRMATION", "COMPLETED")))
    @rule(order_id=orders)
    def request_revision(self, order_id: uuid.UUID) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None:
                return
            try:
                orders_service.request_revision(
                    session,
                    self.lead_actor_revise,
                    order_id,
                    OrderRevise(version=order.version, reason="Khach phan hoi can sua lai"),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    # --- task commands (AC-SYS-093) --------------------------------------------------------------

    @precondition(
        lambda self: (
            self._live_task_count() < 3
            and self._exists_order_with_status(("PENDING_DISPATCH", "IN_PROGRESS", "REVISION"))
        )
    )
    @rule(
        target=tasks,
        order_id=orders,
        assignee_count=st.integers(min_value=1, max_value=3),
        hours=st.sampled_from(_HOURS),
    )
    def create_task(self, order_id: uuid.UUID, assignee_count: int, hours: Decimal) -> object:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, order_id)
            if order is None:
                return multiple()
            assignee_ids = self.technician_ids[:assignee_count]
            before_status = order.status
            try:
                detail = dispatch_service.create_task(
                    session,
                    self.lead_actor_task,
                    order_id,
                    TaskCreate(
                        version=order.version,
                        title="Task stateful",
                        estimated_hours=hours,
                        due_at=self._now() + timedelta(days=1),
                        assignee_ids=assignee_ids,
                    ),
                    now=self._now(),
                    specs=SPECS,
                )
                if detail.order_status != before_status:
                    self._transition_audit_count += 1  # system-triggered start_dispatch side effect
                return multiple({"order_id": order_id, "task_id": detail.id})
            except AppError as err:
                self._expect_rejected(err)
                return multiple()

    @precondition(
        lambda self: self._exists_order_with_status(("PENDING_DISPATCH", "IN_PROGRESS", "REVISION"))
    )
    @rule(task=tasks, hours=st.sampled_from(_HOURS))
    def update_task(self, task: dict, hours: Decimal) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, task["order_id"])
            if order is None:
                return
            try:
                dispatch_service.update_task(
                    session,
                    self.lead_actor_task,
                    task["order_id"],
                    task["task_id"],
                    TaskUpdate(version=order.version, estimated_hours=hours),
                    specs=SPECS,
                )
            except AppError as err:
                self._expect_rejected(err)

    @precondition(
        lambda self: self._exists_order_with_status(("PENDING_DISPATCH", "IN_PROGRESS", "REVISION"))
    )
    @rule(task=tasks, employee_index=st.integers(min_value=0, max_value=2))
    def add_assignee(self, task: dict, employee_index: int) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, task["order_id"])
            if order is None:
                return
            employee_id = self.technician_ids[employee_index]
            try:
                dispatch_service.add_assignee(
                    session,
                    self.lead_actor_task,
                    task["order_id"],
                    task["task_id"],
                    TaskAddAssignee(version=order.version, employee_id=employee_id),
                    specs=SPECS,
                )
            except AppError as err:
                self._expect_rejected(err)

    @precondition(
        lambda self: self._exists_order_with_status(("PENDING_DISPATCH", "IN_PROGRESS", "REVISION"))
    )
    @rule(task=tasks)
    def cancel_task(self, task: dict) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, task["order_id"])
            if order is None:
                return
            try:
                dispatch_service.cancel_task(
                    session,
                    self.lead_actor_task,
                    task["order_id"],
                    task["task_id"],
                    TaskCancel(version=order.version, reason="Huy dau viec test thuoc tinh"),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_order_with_status(("REVISION",)))
    @rule(task=tasks, severity=st.sampled_from(["MINOR", "MAJOR"]))
    def reopen_task(self, task: dict, severity: str) -> None:
        with self.session_factory() as session, session.begin():
            order = session.get(Order, task["order_id"])
            if order is None:
                return
            try:
                dispatch_service.reopen_task(
                    session,
                    self.lead_actor_reopen,
                    task["order_id"],
                    task["task_id"],
                    TaskReopen(version=order.version, reason="Lam sai, can lam lai", severity=severity),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    # --- assignment transitions (AC-SYS-093) -----------------------------------------------------
    # None of these draw from a bundle: they act on an existing assignment picked globally by
    # status (see _pick_assignment_by_status) rather than via a `task=tasks` bundle parameter, so
    # advancing one assignment through its lifecycle doesn't also depend on "which of up to 3 live
    # tasks" being drawn correctly at each step.

    @precondition(lambda self: self._exists_assignment_with_status(("PENDING",)))
    @rule(index=st.integers(min_value=0, max_value=5))
    def accept_assignment(self, index: int) -> None:
        with self.session_factory() as session, session.begin():
            assignment = _pick_assignment_by_status(session, ("PENDING",), index)
            if assignment is None:
                return
            task_row = session.get(Task, assignment.task_id)
            order = session.get(Order, task_row.order_id)
            actor = _make_actor(assignment.employee_id, "TECHNICIAN", "assignment.respond")
            try:
                assignments_service.accept_assignment(
                    session,
                    actor,
                    assignment.id,
                    AssignmentAccept(version=order.version),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_assignment_with_status(("PENDING",)))
    @rule(index=st.integers(min_value=0, max_value=5))
    def reject_assignment(self, index: int) -> None:
        with self.session_factory() as session, session.begin():
            assignment = _pick_assignment_by_status(session, ("PENDING",), index)
            if assignment is None:
                return
            task_row = session.get(Task, assignment.task_id)
            order = session.get(Order, task_row.order_id)
            actor = _make_actor(assignment.employee_id, "TECHNICIAN", "assignment.respond")
            try:
                assignments_service.reject_assignment(
                    session,
                    actor,
                    assignment.id,
                    AssignmentReject(version=order.version, reason_code="SICK", reason_text="Dang nghi om"),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_assignment_with_status(("ACCEPTED",)))
    @rule(index=st.integers(min_value=0, max_value=5))
    def start_assignment(self, index: int) -> None:
        with self.session_factory() as session, session.begin():
            assignment = _pick_assignment_by_status(session, ("ACCEPTED",), index)
            if assignment is None:
                return
            task_row = session.get(Task, assignment.task_id)
            order = session.get(Order, task_row.order_id)
            actor = _make_actor(assignment.employee_id, "TECHNICIAN", "assignment.respond")
            try:
                assignments_service.start_assignment(
                    session,
                    actor,
                    assignment.id,
                    AssignmentStart(version=order.version),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_assignment_with_status(("IN_PROGRESS",)))
    @rule(index=st.integers(min_value=0, max_value=5))
    def complete_assignment(self, index: int) -> None:
        with self.session_factory() as session, session.begin():
            assignment = _pick_assignment_by_status(session, ("IN_PROGRESS",), index)
            if assignment is None:
                return
            task_row = session.get(Task, assignment.task_id)
            order = session.get(Order, task_row.order_id)
            before_status = order.status
            actor = _make_actor(assignment.employee_id, "TECHNICIAN", "assignment.respond")
            try:
                assignments_service.complete_assignment(
                    session,
                    actor,
                    assignment.id,
                    AssignmentComplete(version=order.version),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
                session.flush()
                after = session.get(Order, order.id)
                if after is not None and after.status != before_status:
                    self._transition_audit_count += 1  # system-triggered all_tasks_done side effect
            except AppError as err:
                self._expect_rejected(err)

    @precondition(lambda self: self._exists_assignment_with_status(("PENDING", "ACCEPTED", "IN_PROGRESS")))
    @rule(index=st.integers(min_value=0, max_value=5))
    def remove_assignment(self, index: int) -> None:
        with self.session_factory() as session, session.begin():
            assignment = _pick_assignment_by_status(session, ("PENDING", "ACCEPTED", "IN_PROGRESS"), index)
            if assignment is None:
                return
            task_row = session.get(Task, assignment.task_id)
            order = session.get(Order, task_row.order_id)
            try:
                dispatch_service.remove_assignee(
                    session,
                    self.lead_actor_task,
                    order.id,
                    task_row.id,
                    assignment.id,
                    TaskAssigneeRemove(version=order.version),
                    now=self._now(),
                    specs=SPECS,
                )
                self._transition_audit_count += 1
            except AppError as err:
                self._expect_rejected(err)

    # --- invariants (AC-SYS-094 — docstrings must match spec/state_machines.yaml#invariants verbatim) -

    @invariant()
    def inv_completed_has_confirmation_attachment(self) -> None:
        """An order in COMPLETED has ≥1 CUSTOMER_CONFIRMATION attachment for its current revision_no."""
        with self.session_factory() as session:
            for order in session.scalars(select(Order).where(Order.status == "COMPLETED")):
                count = session.scalar(
                    select(func.count())
                    .select_from(Attachment)
                    .where(
                        Attachment.owner_type == "ORDER",
                        Attachment.owner_id == order.id,
                        Attachment.kind == "CUSTOMER_CONFIRMATION",
                        Attachment.revision_no == order.revision_no,
                    )
                )
                assert (count or 0) >= 1, f"order {order.id} COMPLETED without a confirmation attachment"

    @invariant()
    def inv_awaiting_or_completed_has_all_tasks_done(self) -> None:
        """An order in AWAITING_CONFIRMATION or COMPLETED has ≥1 non-cancelled task and all are DONE."""
        with self.session_factory() as session:
            for order in session.scalars(
                select(Order).where(Order.status.in_(("AWAITING_CONFIRMATION", "COMPLETED")))
            ):
                statuses = session.scalars(
                    select(Task.status).where(Task.order_id == order.id, Task.cancelled_at.is_(None))
                ).all()
                assert len(statuses) >= 1, f"order {order.id} has no active task in {order.status}"
                assert all(s == "DONE" for s in statuses), (
                    f"order {order.id} has a non-DONE task in {order.status}"
                )

    @invariant()
    def inv_task_status_matches_derived(self) -> None:
        """A task's stored status always equals the derived status computed from its assignments."""
        with self.session_factory() as session:
            for task in session.scalars(select(Task)):
                statuses = session.scalars(
                    select(Assignment.status).where(
                        Assignment.task_id == task.id,
                        Assignment.cycle == task.cycle,
                        Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES),
                    )
                ).all()
                expected = _derive_task_status(list(statuses), cancelled=task.cancelled_at is not None)
                assert task.status == expected, f"task {task.id} stored={task.status} derived={expected}"

    @invariant()
    def inv_one_active_assignment_per_task_per_cycle(self) -> None:
        """An employee has at most one active assignment per task per cycle."""
        with self.session_factory() as session:
            rows = session.execute(
                select(Assignment.task_id, Assignment.employee_id, Assignment.cycle, func.count())
                .where(Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES))
                .group_by(Assignment.task_id, Assignment.employee_id, Assignment.cycle)
            ).all()
            for task_id, employee_id, cycle, count in rows:
                assert count <= 1, (
                    f"task {task_id} employee {employee_id} cycle {cycle} has {count} active assignments"
                )

    @invariant()
    def inv_previous_cycle_assignments_untouched(self) -> None:
        """Assignments of a previous cycle are never modified after the task is reopened."""
        with self.session_factory() as session:
            rows = session.execute(
                select(Assignment.id, Assignment.status, Task.cycle)
                .join(Task, Task.id == Assignment.task_id)
                .where(Assignment.cycle < Task.cycle)
            ).all()
            for assignment_id, status, _task_cycle in rows:
                assert status in ("DONE", "REJECTED", "REMOVED"), (
                    f"assignment {assignment_id} of a previous cycle is left in live status {status}"
                )

    @invariant()
    def inv_exactly_one_audit_event_per_transition(self) -> None:
        """Every state change produces exactly one audit_event with from/to states."""
        with self.session_factory() as session:
            count = session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.from_status.is_not(None), AuditEvent.to_status.is_not(None))
            )
            assert (count or 0) == self._transition_audit_count, (
                f"expected {self._transition_audit_count} from/to audit rows, found {count}"
            )

    @invariant()
    def inv_cancelled_order_has_no_live_assignments(self) -> None:
        """A CANCELLED order has no PENDING/ACCEPTED/IN_PROGRESS assignments."""
        with self.session_factory() as session:
            rows = session.execute(
                select(func.count())
                .select_from(Assignment)
                .join(Task, Task.id == Assignment.task_id)
                .join(Order, Order.id == Task.order_id)
                .where(
                    Order.status == "CANCELLED", Assignment.status.in_(("PENDING", "ACCEPTED", "IN_PROGRESS"))
                )
            ).scalar()
            assert (rows or 0) == 0, "a CANCELLED order still has a live assignment"

    @invariant()
    def inv_revision_no_and_cycle_only_increase(self) -> None:
        """revision_no only increases; task.cycle only increases."""
        with self.session_factory() as session:
            for order in session.scalars(select(Order)):
                previous = self._seen_revision_no.get(order.id, 0)
                assert order.revision_no >= previous, (
                    f"order {order.id} revision_no went from {previous} to {order.revision_no}"
                )
                self._seen_revision_no[order.id] = order.revision_no
            for task in session.scalars(select(Task)):
                previous = self._seen_cycle.get(task.id, 1)
                assert task.cycle >= previous, f"task {task.id} cycle went from {previous} to {task.cycle}"
                self._seen_cycle[task.id] = task.cycle


TestWorkflow = WorkflowMachine.TestCase
