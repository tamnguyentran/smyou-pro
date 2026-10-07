"""M5-02: `POST /api/v1/assignments/{id}/accept|reject` (AC-ASG-017…041, backend layers only;
component/e2e AC-ASG-035…041 live in frontend)."""

import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from app.modules.workflow.guards import GUARDS, PENDING_GUARDS
from tests.integration.conftest import AN, KHOA, seed
from tests.integration.test_dispatch_api import HOA, MINH, TUAN, audit_rows, client_as, insert_order, problem
from tests.integration.test_dispatch_board_api import insert_assignment, insert_task

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH)}


def _order_and_task(
    db: Connection, people: dict[str, uuid.UUID], *, order_code: str, task_code: str, order_version: int = 3
) -> tuple[uuid.UUID, uuid.UUID]:
    order_id = insert_order(
        db, created_by=people["NV005"], status="IN_PROGRESS", code=order_code, version=order_version
    )
    task_id = insert_task(
        db,
        order_id,
        code=task_code,
        title="Lắp 4 camera ngoài trời",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="3.5",
    )
    return order_id, task_id


def task_row(db: Connection, task_id: uuid.UUID) -> Any:
    return db.execute(text("SELECT * FROM tasks WHERE id = :id"), {"id": task_id}).one()


def assignment_row(db: Connection, assignment_id: uuid.UUID) -> Any:
    return db.execute(text("SELECT * FROM assignments WHERE id = :id"), {"id": assignment_id}).one()


def order_version(db: Connection, order_id: uuid.UUID) -> int:
    return db.execute(text("SELECT version FROM orders WHERE id = :id"), {"id": order_id}).scalar_one()


def cancel_task_directly(db: Connection, task_id: uuid.UUID) -> None:
    db.execute(text("UPDATE tasks SET cancelled_at = now() WHERE id = :id"), {"id": task_id})


def set_order_status(db: Connection, order_id: uuid.UUID, status: str) -> None:
    db.execute(text("UPDATE orders SET status = :status WHERE id = :id"), {"status": status, "id": order_id})


# ---------------- accept ----------------


@pytest.mark.ac("AC-ASG-017")
def test_accept_single_assignee_moves_task_to_accepted(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id, task_id = _order_and_task(db, people, order_code="DH2610-0012", task_code="DH2610-0012-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": 3})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["assignment_status"] == "ACCEPTED"
    assert body["order_version"] == 4

    a = assignment_row(db, assignment_id)
    assert a.status == "ACCEPTED"
    assert a.accepted_at is not None
    assert task_row(db, task_id).status == "ACCEPTED"
    assert order_version(db, order_id) == 4

    events = audit_rows(db, assignment_id)
    assert len(events) == 1
    assert (events[0].entity_type, events[0].action, events[0].from_status, events[0].to_status) == (
        "ASSIGNMENT",
        "accept",
        "PENDING",
        "ACCEPTED",
    )


@pytest.mark.ac("AC-ASG-018")
def test_accept_one_of_two_leaves_task_pending_acceptance(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0013", task_code="DH2610-0013-T1")
    khoa_assignment = insert_assignment(db, task_id, people["NV014"], "PENDING")
    insert_assignment(db, task_id, people["NV015"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{khoa_assignment}/accept", json={"version": 3})

    assert res.status_code == 200, res.text
    assert assignment_row(db, khoa_assignment).status == "ACCEPTED"
    assert task_row(db, task_id).status == "PENDING_ACCEPTANCE"


@pytest.mark.ac("AC-ASG-019")
def test_accept_other_technicians_assignment_is_404(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0014", task_code="DH2610-0014-T1")
    khoa_assignment = insert_assignment(db, task_id, people["NV014"], "PENDING")
    minh = client_as(app, MINH)

    res = minh.post(f"/api/v1/assignments/{khoa_assignment}/accept", json={"version": 3})
    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-ASG-020")
def test_accept_already_accepted_is_invalid_transition(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0015", task_code="DH2610-0015-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "ACCEPTED")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": 3})
    problem(res, 409, "INVALID_TRANSITION")


@pytest.mark.ac("AC-ASG-021")
def test_accept_stale_version_is_409(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0016", task_code="DH2610-0016-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": 2})

    problem(res, 409, "STALE_VERSION")
    assert assignment_row(db, assignment_id).status == "PENDING"


@pytest.mark.ac("AC-ASG-022")
def test_accept_cancelled_task_guard_fails(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0017", task_code="DH2610-0017-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    cancel_task_directly(db, task_id)
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": 3})

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "task_not_cancelled"


@pytest.mark.ac("AC-ASG-023")
def test_accept_order_not_dispatchable_guard_fails(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id, task_id = _order_and_task(db, people, order_code="DH2610-0018", task_code="DH2610-0018-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    set_order_status(db, order_id, "COMPLETED")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": 3})

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "order_in_dispatchable_state"


@pytest.mark.ac("AC-ASG-024")
def test_accept_forbidden_for_sale_manager_tech_lead(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0019", task_code="DH2610-0019-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")

    for person in (HOA, AN, TUAN):
        res = client_as(app, person).post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": 3})
        problem(res, 403, "FORBIDDEN")


# ---------------- reject ----------------


@pytest.mark.ac("AC-ASG-026")
def test_reject_single_assignee_moves_task_to_needs_assignee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id, task_id = _order_and_task(db, people, order_code="DH2610-0020", task_code="DH2610-0020-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={
            "version": 3,
            "reason_code": "DISTANCE",
            "reason_text": "Địa chỉ quá xa, không kịp di chuyển trong ngày",
        },
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["assignment_status"] == "REJECTED"
    assert body["order_version"] == 4

    a = assignment_row(db, assignment_id)
    assert a.status == "REJECTED"
    assert a.rejected_at is not None
    assert a.reject_reason_code == "DISTANCE"
    assert a.reject_reason_text == "Địa chỉ quá xa, không kịp di chuyển trong ngày"
    assert task_row(db, task_id).status == "NEEDS_ASSIGNEE"
    assert order_version(db, order_id) == 4

    events = audit_rows(db, assignment_id)
    assert len(events) == 1
    assert (events[0].entity_type, events[0].action, events[0].from_status, events[0].to_status) == (
        "ASSIGNMENT",
        "reject",
        "PENDING",
        "REJECTED",
    )
    assert events[0].data == {
        "reason_code": "DISTANCE",
        "reason_text": "Địa chỉ quá xa, không kịp di chuyển trong ngày",
    }


@pytest.mark.ac("AC-ASG-027")
def test_reject_one_of_two_leaves_task_pending_acceptance(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0021", task_code="DH2610-0021-T1")
    khoa_assignment = insert_assignment(db, task_id, people["NV014"], "PENDING")
    insert_assignment(db, task_id, people["NV015"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/assignments/{khoa_assignment}/reject",
        json={"version": 3, "reason_code": "SKILL", "reason_text": "Không phù hợp chuyên môn lắm"},
    )

    assert res.status_code == 200, res.text
    assert assignment_row(db, khoa_assignment).status == "REJECTED"
    assert task_row(db, task_id).status == "PENDING_ACCEPTANCE"


@pytest.mark.ac("AC-ASG-028")
def test_reject_short_reason_text_guard_fails(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0022", task_code="DH2610-0022-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={"version": 3, "reason_code": "DISTANCE", "reason_text": "xa"},
    )

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "reject_reason_text_present"
    assert assignment_row(db, assignment_id).status == "PENDING"


@pytest.mark.ac("AC-ASG-029")
def test_reject_invalid_or_missing_reason_code_is_422(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0023", task_code="DH2610-0023-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    missing = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={"version": 3, "reason_text": "Lý do hợp lệ đủ dài"},
    )
    assert missing.status_code == 422, missing.text

    invalid = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={"version": 3, "reason_code": "KHAC", "reason_text": "Lý do hợp lệ đủ dài"},
    )
    assert invalid.status_code == 422, invalid.text
    assert assignment_row(db, assignment_id).status == "PENDING"


@pytest.mark.ac("AC-ASG-030")
def test_reject_other_technicians_assignment_is_404(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0024", task_code="DH2610-0024-T1")
    khoa_assignment = insert_assignment(db, task_id, people["NV014"], "PENDING")
    minh = client_as(app, MINH)

    res = minh.post(
        f"/api/v1/assignments/{khoa_assignment}/reject",
        json={"version": 3, "reason_code": "OTHER", "reason_text": "Lý do hợp lệ đủ dài"},
    )
    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-ASG-031")
def test_reject_already_rejected_is_invalid_transition(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0025", task_code="DH2610-0025-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "REJECTED")
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={"version": 3, "reason_code": "OTHER", "reason_text": "Lý do hợp lệ đủ dài"},
    )
    problem(res, 409, "INVALID_TRANSITION")


@pytest.mark.ac("AC-ASG-032")
def test_reject_stale_version_is_409(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0026", task_code="DH2610-0026-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={"version": 99, "reason_code": "OTHER", "reason_text": "Lý do hợp lệ đủ dài"},
    )

    problem(res, 409, "STALE_VERSION")
    assert assignment_row(db, assignment_id).status == "PENDING"


@pytest.mark.ac("AC-ASG-033")
def test_reject_forbidden_for_sale_manager_tech_lead(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    _order_id, task_id = _order_and_task(db, people, order_code="DH2610-0027", task_code="DH2610-0027-T1")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")

    for person in (HOA, AN, TUAN):
        res = client_as(app, person).post(
            f"/api/v1/assignments/{assignment_id}/reject",
            json={"version": 3, "reason_code": "OTHER", "reason_text": "Lý do hợp lệ đủ dài"},
        )
        problem(res, 403, "FORBIDDEN")


@pytest.mark.ac("AC-ASG-025")
@pytest.mark.ac("AC-ASG-034")
def test_routes_declare_capability_and_guards_implemented(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/assignments/" in r[1] or r[1].endswith("/assignments/me")}
    assert ("POST", "/api/v1/assignments/{assignment_id}/accept", "assignment.respond") in routes
    assert ("POST", "/api/v1/assignments/{assignment_id}/reject", "assignment.respond") in routes
    assert {"reject_reason_code_present", "reject_reason_text_present"} <= set(GUARDS)
    assert not {"reject_reason_code_present", "reject_reason_text_present"} & set(PENDING_GUARDS)
