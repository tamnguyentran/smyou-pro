"""M6-03a: mở lại đầu việc DONE + defect_records (AC-DSP-108…119)."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, Person, seed
from tests.integration.test_orders_complete_api import HOA, LONG, TUAN, client_as, problem
from tests.integration.test_orders_confirmation_api import insert_order

KHOA = Person("khoa.tran@smyou.vn", "TamThoi#14", ("TECHNICIAN",), "NV014", "Trần Minh Khoa", "TECHNICAL")
MINH = Person("minh.le@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV012", "Lê Văn Minh", "TECHNICAL")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH, LONG)}


def insert_done_task(
    db: Connection,
    *,
    order_id: uuid.UUID,
    employee_ids: list[uuid.UUID],
    created_by: uuid.UUID,
    cycle: int = 1,
    created_in_revision: int = 0,
) -> tuple[uuid.UUID, dict[uuid.UUID, uuid.UUID]]:
    """A DONE task with one DONE assignment per employee_id. Returns (task_id, {employee_id:
    assignment_id})."""
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, cycle, created_by)"
            " VALUES (:id, :order_id, :code, 'Việc mẫu', 'INITIAL', :created_in_revision, 'DONE', 2,"
            " :due_at, 'NORMAL', :cycle, :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": f"CV{uuid.uuid4().hex[:6]}",
            "created_in_revision": created_in_revision,
            "due_at": datetime(2026, 10, 5, 9, 0, tzinfo=UTC),
            "cycle": cycle,
            "created_by": created_by,
        },
    )
    assignment_ids: dict[uuid.UUID, uuid.UUID] = {}
    for employee_id in employee_ids:
        assignment_id = uuid.uuid4()
        db.execute(
            text(
                "INSERT INTO assignments (id, task_id, employee_id, status, cycle, assigned_by, done_at)"
                " VALUES (:id, :task_id, :employee_id, 'DONE', :cycle, :assigned_by, :done_at)"
            ),
            {
                "id": assignment_id,
                "task_id": task_id,
                "employee_id": employee_id,
                "cycle": cycle,
                "assigned_by": created_by,
                "done_at": datetime(2026, 10, 1, tzinfo=UTC),
            },
        )
        assignment_ids[employee_id] = assignment_id
    return task_id, assignment_ids


def audit_rows(db: Connection, task_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action, from_status, to_status, actor_id FROM audit_events"
            " WHERE entity_type='TASK' AND entity_id=:id ORDER BY occurred_at"
        ),
        {"id": task_id},
    ).mappings()
    return [dict(r) for r in rows]


def defect_rows(db: Connection, task_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT cycle, assignment_id, employee_id, reason, severity, reported_by FROM defect_records"
            " WHERE task_id = :id ORDER BY created_at"
        ),
        {"id": task_id},
    ).mappings()
    return [dict(r) for r in rows]


@pytest.mark.ac("AC-DSP-108")
def test_reopen_single_assignee(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0108"
    )
    task_id, assignment_ids = insert_done_task(
        db, order_id=order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
        json={
            "version": order["version"],
            "reason": "Camera lắp sai vị trí, cần lắp lại đúng chỗ theo bản vẽ",
            "severity": "MAJOR",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cycle"] == 2
    assert body["reopen_count"] == 1
    assert body["status"] == "PENDING_ACCEPTANCE"
    assert body["order_version"] == order["version"] + 1
    assert [a["employee_id"] for a in body["assignees"]] == [str(people["NV014"])]

    old_assignment = (
        db.execute(
            text("SELECT status, cycle FROM assignments WHERE id = :id"),
            {"id": assignment_ids[people["NV014"]]},
        )
        .mappings()
        .one()
    )
    assert old_assignment["status"] == "DONE"
    assert old_assignment["cycle"] == 1

    defects = defect_rows(db, task_id)
    assert len(defects) == 1
    assert defects[0]["assignment_id"] == assignment_ids[people["NV014"]]
    assert defects[0]["employee_id"] == people["NV014"]
    assert defects[0]["severity"] == "MAJOR"

    events = audit_rows(db, task_id)
    assert events[-1]["action"] == "reopen"
    assert events[-1]["from_status"] == "DONE"
    assert events[-1]["to_status"] == "PENDING_ACCEPTANCE"

    assert db.execute(text("SELECT status FROM orders WHERE id = :id"), {"id": order_id}).scalar() == (
        "REVISION"
    )


@pytest.mark.ac("AC-DSP-109")
def test_reopen_multiple_assignees(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0109"
    )
    task_id, _ = insert_done_task(
        db,
        order_id=order_id,
        employee_ids=[people["NV014"], people["NV012"]],
        created_by=people["NV001"],
    )
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
        json={"version": order["version"], "reason": "Cả 2 camera lắp lệch góc", "severity": "MINOR"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cycle"] == 2
    assert {a["employee_id"] for a in body["assignees"]} == {str(people["NV014"]), str(people["NV012"])}

    defects = defect_rows(db, task_id)
    assert len(defects) == 2
    assert {d["employee_id"] for d in defects} == {people["NV014"], people["NV012"]}


@pytest.mark.ac("AC-DSP-110")
def test_reopen_guard_order_in_revision(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0110"
    )
    task_id, _ = insert_done_task(
        db, order_id=order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    res = problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
            json={"version": order["version"], "reason": "Lý do hợp lệ đủ dài", "severity": "MINOR"},
        ),
        409,
        "GUARD_FAILED",
    )
    assert res["guard"] == "order_in_revision"
    assert defect_rows(db, task_id) == []


@pytest.mark.ac("AC-DSP-111")
def test_reopen_invalid_transition(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0111"
    )
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    for status in ("ACCEPTED", "IN_PROGRESS", "PENDING_ACCEPTANCE", "CANCELLED"):
        task_id = uuid.uuid4()
        db.execute(
            text(
                "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
                " estimated_hours, due_at, priority, cycle, created_by)"
                " VALUES (:id, :order_id, :code, 'Việc mẫu', 'INITIAL', 1, :status, 2, :due_at,"
                " 'NORMAL', 1, :created_by)"
            ),
            {
                "id": task_id,
                "order_id": order_id,
                "code": f"CV{uuid.uuid4().hex[:6]}",
                "status": status,
                "due_at": datetime(2026, 10, 5, 9, 0, tzinfo=UTC),
                "created_by": people["NV001"],
            },
        )
        res = tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
            json={"version": order["version"], "reason": "Lý do hợp lệ đủ dài", "severity": "MINOR"},
        )
        problem(res, 409, "INVALID_TRANSITION")


@pytest.mark.ac("AC-DSP-112")
def test_reopen_guard_reason_present(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0112"
    )
    task_id, _ = insert_done_task(
        db, order_id=order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    for reason in ("", "lỗi"):
        res = problem(
            tuan.post(
                f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
                json={"version": order["version"], "reason": reason, "severity": "MINOR"},
            ),
            409,
            "GUARD_FAILED",
        )
        assert res["guard"] == "reason_present"

    assert tuan.get(f"/api/v1/orders/{order_id}/tasks/{task_id}").json()["status"] == "DONE"


@pytest.mark.ac("AC-DSP-113")
def test_reopen_forbidden_for_non_tech_lead(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0113"
    )
    task_id, _ = insert_done_task(
        db, order_id=order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    body = {"version": 1, "reason": "Lý do hợp lệ đủ dài", "severity": "MINOR"}

    for person in (KHOA, LONG, HOA, AN):
        client = client_as(app, person)
        problem(client.post(f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen", json=body), 403, "FORBIDDEN")


@pytest.mark.ac("AC-DSP-114")
def test_reopen_task_order_mismatch_404(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0114"
    )
    other_order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0115"
    )
    task_id, _ = insert_done_task(
        db, order_id=other_order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
        json={"version": 1, "reason": "Lý do hợp lệ đủ dài", "severity": "MINOR"},
    )
    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-DSP-115")
def test_reopen_stale_version(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0116"
    )
    task_id, _ = insert_done_task(
        db, order_id=order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
        json={"version": 99, "reason": "Lý do hợp lệ đủ dài", "severity": "MINOR"},
    )
    problem(res, 409, "STALE_VERSION")


@pytest.mark.ac("AC-DSP-116")
def test_route_declares_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if r[1] == "/api/v1/orders/{order_id}/tasks/{task_id}/reopen"}
    assert routes == {("POST", "/api/v1/orders/{order_id}/tasks/{task_id}/reopen", "task.reopen")}


@pytest.mark.ac("AC-DSP-117")
def test_all_tasks_done_after_reopen_in_revision(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=2, code="DH2610-0117"
    )
    task_id, _ = insert_done_task(
        db, order_id=order_id, employee_ids=[people["NV014"]], created_by=people["NV001"]
    )
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()
    reopened = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
        json={"version": order["version"], "reason": "Lý do hợp lệ đủ dài", "severity": "MINOR"},
    ).json()
    assert reopened["last_reopened_in_revision"] == 2

    khoa = client_as(app, KHOA)
    assignment_id = reopened["assignees"][0]["id"]
    assert (
        khoa.post(
            f"/api/v1/assignments/{assignment_id}/accept", json={"version": reopened["order_version"]}
        ).status_code
        == 200
    )
    v1 = khoa.get(f"/api/v1/orders/{order_id}").json()["version"]
    assert khoa.post(f"/api/v1/assignments/{assignment_id}/start", json={"version": v1}).status_code == 200
    v2 = khoa.get(f"/api/v1/orders/{order_id}").json()["version"]
    complete_res = khoa.post(
        f"/api/v1/assignments/{assignment_id}/complete",
        json={"version": v2, "completion_note": "Đã lắp lại đúng vị trí", "actual_hours": "1.5"},
    )
    assert complete_res.status_code == 200, complete_res.text

    final_order = tuan.get(f"/api/v1/orders/{order_id}").json()
    assert final_order["status"] == "AWAITING_CONFIRMATION"

    events = (
        db.execute(
            text(
                "SELECT actor_id, action FROM audit_events WHERE entity_type='ORDER' AND entity_id=:id"
                " ORDER BY occurred_at"
            ),
            {"id": order_id},
        )
        .mappings()
        .all()
    )
    system_event = [e for e in events if e["action"] == "all_tasks_done"][-1]
    assert system_event["actor_id"] is None


@pytest.mark.ac("AC-DSP-119")
def test_me_revision_count_badge(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for i in range(3):
        insert_order(db, created_by=people["NV001"], status="REVISION", revision_no=1, code=f"DH2610-02{i}0")
    insert_order(db, created_by=people["NV001"], status="PENDING_DISPATCH", revision_no=0, code="DH2610-0230")

    tuan = client_as(app, TUAN)
    an = client_as(app, AN)
    hoa = client_as(app, HOA)

    tuan_me = tuan.get("/api/v1/me").json()
    an_me = an.get("/api/v1/me").json()
    hoa_me = hoa.get("/api/v1/me").json()

    assert tuan_me["counters"]["revision_count"] == 3
    assert "revision_count" not in an_me["counters"]
    assert "revision_count" not in hoa_me["counters"]
