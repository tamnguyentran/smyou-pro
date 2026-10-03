"""M4-01a: dispatch queue + task creation + multi-assignee API (AC-DSP-001…014, AC-ORD-115…117).
M4-02a: sửa/huỷ task, thêm/gỡ người (AC-DSP-038…057) appended at the bottom."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.engine import Row

from app.core.authz import declared_routes
from app.modules.workflow.guards import GUARDS, PENDING_GUARDS
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")
MINH = Person("minh.vo@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV015", "Võ Thành Minh", "TECHNICAL")
LAN = Person("lan.do@smyou.vn", "Lan@SmYou26", ("TECHNICIAN",), "NV016", "Đỗ Thị Lan", "TECHNICAL")
DUC = Person("duc.nguyen@smyou.vn", "Duc@SmYou26", ("TECHNICIAN",), "NV017", "Nguyễn Văn Đức", "TECHNICAL")


def insert_order(
    db: Connection,
    *,
    created_by: uuid.UUID,
    status: str,
    code: str | None = None,
    priority: str | None = None,
    requested_date: date | None = None,
    customer_name: str | None = None,
    customer_phone: str | None = None,
    created_at: datetime | None = None,
    version: int = 1,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    columns = ["id", "code", "status", "created_by", "version"]
    params: dict[str, object] = {
        "id": order_id,
        "code": code or f"DH0000-{uuid.uuid4().hex[:4]}",
        "status": status,
        "created_by": created_by,
        "version": version,
    }
    extra = {
        "priority": priority,
        "requested_date": requested_date,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "created_at": created_at,
    }
    for column, value in extra.items():
        if value is not None:
            columns.append(column)
            params[column] = value
    placeholders = ", ".join(f":{c}" for c in columns)
    query = f"INSERT INTO orders ({', '.join(columns)}) VALUES ({placeholders})"  # noqa: S608  # column names are literal strings from the fixed set above, not user input
    db.execute(text(query), params)
    return order_id


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res: Any, status: int, code: str) -> dict[str, Any]:
    assert res.status_code == status, res.text
    body: dict[str, Any] = res.json()
    assert body["code"] == code
    return body


def audit_rows(db: Connection, entity_id: uuid.UUID) -> list[Row]:
    return db.execute(
        text("SELECT * FROM audit_events WHERE entity_id = :id ORDER BY occurred_at, seq"), {"id": entity_id}
    ).all()


def _valid_body(people: dict[str, uuid.UUID], **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "version": 1,
        "title": "Việc mẫu",
        "estimated_hours": "2",
        "due_at": "2026-10-05T09:00:00+07:00",
        "assignee_ids": [str(people["NV014"])],
    }
    body.update(overrides)
    return body


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    ids = {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH)}
    ids[LAN.code] = seed(db, LAN, is_active=False)
    return ids


# ---------------- task creation ----------------


@pytest.mark.ac("AC-DSP-001")
def test_create_first_task_starts_dispatch(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0001")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(
            people,
            title="Lắp đặt 4 camera tầng 1",
            estimated_hours="4",
            priority="HIGH",
            assignee_ids=[str(people["NV014"]), str(people["NV015"])],
        ),
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["code"] == "DH2610-0001-T1"
    assert body["origin"] == "INITIAL"
    assert body["cycle"] == 1
    assert body["status"] == "PENDING_ACCEPTANCE"
    assert len(body["assignees"]) == 2
    assert all(a["status"] == "PENDING" for a in body["assignees"])
    assert {a["employee_id"] for a in body["assignees"]} == {str(people["NV014"]), str(people["NV015"])}
    assert body["order_status"] == "IN_PROGRESS"
    assert body["order_version"] == 2

    task_events = audit_rows(db, uuid.UUID(body["id"]))
    assert len(task_events) == 1
    assert (task_events[0].entity_type, task_events[0].action, task_events[0].to_status) == (
        "TASK",
        "create",
        "PENDING_ACCEPTANCE",
    )
    assert task_events[0].actor_id == people["NV010"]

    order_events = audit_rows(db, order_id)
    assert len(order_events) == 1
    assert (
        order_events[0].entity_type,
        order_events[0].action,
        order_events[0].from_status,
        order_events[0].to_status,
        order_events[0].actor_id,
    ) == ("ORDER", "start_dispatch", "PENDING_DISPATCH", "IN_PROGRESS", None)


@pytest.mark.ac("AC-DSP-002")
def test_create_second_task_does_not_refire_start_dispatch(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0002")
    tuan = client_as(app, TUAN)
    first = tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people, title="Việc 1")).json()
    assert first["order_version"] == 2

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(
            people,
            version=first["order_version"],
            title="Kiểm tra đầu ghi",
            estimated_hours="2",
            due_at="2026-10-06T09:00:00+07:00",
            priority="NORMAL",
        ),
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["code"] == "DH2610-0002-T2"
    assert body["order_status"] == "IN_PROGRESS"
    assert body["order_version"] == 3

    assert len(audit_rows(db, order_id)) == 1  # only the start_dispatch fired by the first task


@pytest.mark.ac("AC-DSP-003")
def test_create_task_guard_dispatchable_state_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="DRAFT")
    tuan = client_as(app, TUAN)

    body = problem(
        tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)), 409, "GUARD_FAILED"
    )

    assert body["guard"] == "order_in_dispatchable_state"
    assert db.execute(text("SELECT COUNT(*) FROM tasks WHERE order_id = :id"), {"id": order_id}).scalar() == 0


@pytest.mark.ac("AC-DSP-004")
def test_create_task_guard_dispatchable_state_cancelled(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="CANCELLED")
    tuan = client_as(app, TUAN)

    body = problem(
        tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)), 409, "GUARD_FAILED"
    )

    assert body["guard"] == "order_in_dispatchable_state"


@pytest.mark.ac("AC-DSP-005")
def test_create_task_guard_at_least_one_assignee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH")
    tuan = client_as(app, TUAN)

    body = problem(
        tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people, assignee_ids=[])),
        409,
        "GUARD_FAILED",
    )

    assert body["guard"] == "at_least_one_assignee"


@pytest.mark.ac("AC-DSP-006")
def test_create_task_guard_assignees_are_active_technicians(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH")
    tuan = client_as(app, TUAN)

    inactive = problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks",
            json=_valid_body(people, assignee_ids=[str(people["NV016"])]),  # Lan, is_active=false
        ),
        409,
        "GUARD_FAILED",
    )
    assert inactive["guard"] == "assignees_are_active_technicians"

    not_technician = problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks",
            json=_valid_body(people, assignee_ids=[str(people["NV001"])]),  # An, MANAGER
        ),
        409,
        "GUARD_FAILED",
    )
    assert not_technician["guard"] == "assignees_are_active_technicians"


@pytest.mark.ac("AC-DSP-007")
@pytest.mark.parametrize("hours", ["0", "201", "1.3"])
def test_create_task_guard_estimated_hours_positive(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], hours: str
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH")
    tuan = client_as(app, TUAN)

    body = problem(
        tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people, estimated_hours=hours)),
        409,
        "GUARD_FAILED",
    )

    assert body["guard"] == "estimated_hours_positive"


@pytest.mark.ac("AC-DSP-008")
def test_create_task_guard_due_at_not_in_past(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH")
    tuan = client_as(app, TUAN)

    body = problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks",
            json=_valid_body(people, due_at="2026-09-01T09:00:00+07:00"),
        ),
        409,
        "GUARD_FAILED",
    )

    assert body["guard"] == "due_at_not_in_past"


@pytest.mark.ac("AC-DSP-009")
def test_create_task_rbac(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH")

    for person in (HOA, AN, KHOA):
        client = client_as(app, person)
        problem(client.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)), 403, "FORBIDDEN")

    tuan = client_as(app, TUAN)
    assert tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)).status_code == 200


@pytest.mark.ac("AC-DSP-010")
def test_create_task_stale_version(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", version=5)
    tuan = client_as(app, TUAN)

    problem(
        tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people, version=4)),
        409,
        "STALE_VERSION",
    )
    assert db.execute(text("SELECT COUNT(*) FROM tasks WHERE order_id = :id"), {"id": order_id}).scalar() == 0


# ---------------- dispatch queue / badge / task listing ----------------


@pytest.mark.ac("AC-DSP-011")
def test_list_orders_sort_dispatch(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    h = insert_order(
        db,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH2610-00H1",
        priority="NORMAL",
        requested_date=date(2026, 10, 10),
        created_at=datetime(2026, 9, 20, tzinfo=UTC),
    )
    i = insert_order(
        db,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH2610-00I1",
        priority="URGENT",
        requested_date=date(2026, 10, 12),
        created_at=datetime(2026, 9, 21, tzinfo=UTC),
    )
    k = insert_order(
        db,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH2610-00K1",
        priority="HIGH",
        requested_date=date(2026, 10, 8),
        created_at=datetime(2026, 9, 22, tzinfo=UTC),
    )
    lo = insert_order(
        db,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH2610-00L1",
        priority="LOW",
        requested_date=None,
        created_at=datetime(2026, 9, 23, tzinfo=UTC),
    )
    tuan = client_as(app, TUAN)

    dispatch_res = tuan.get("/api/v1/orders?status=PENDING_DISPATCH&sort=dispatch")
    assert dispatch_res.status_code == 200, dispatch_res.text
    assert [item["id"] for item in dispatch_res.json()["items"]] == [str(i), str(k), str(h), str(lo)]

    default_res = tuan.get("/api/v1/orders?status=PENDING_DISPATCH")
    assert default_res.status_code == 200, default_res.text
    assert [item["id"] for item in default_res.json()["items"]] == [str(lo), str(k), str(i), str(h)]


@pytest.mark.ac("AC-DSP-012")
def test_pending_dispatch_count_badge(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for n in range(4):
        insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code=f"DH2610-00B{n}")

    tuan = client_as(app, TUAN)
    assert tuan.get("/api/v1/me").json()["counters"]["pending_dispatch_count"] == 4

    hoa = client_as(app, HOA)
    assert "pending_dispatch_count" not in hoa.get("/api/v1/me").json()["counters"]


@pytest.mark.ac("AC-DSP-013")
def test_list_order_tasks_scope(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0013")
    tuan = client_as(app, TUAN)
    t1 = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, title="Việc 1", assignee_ids=[str(people["NV014"]), str(people["NV015"])]),
    ).json()
    t2 = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(
            people,
            version=t1["order_version"],
            title="Việc 2",
            due_at="2026-10-06T09:00:00+07:00",
            assignee_ids=[str(people["NV014"])],
        ),
    ).json()

    for person in (TUAN, AN, HOA):
        client = client_as(app, person)
        res = client.get(f"/api/v1/orders/{order_id}/tasks")
        assert res.status_code == 200, res.text
        items = res.json()["items"]
        assert [item["id"] for item in items] == [t1["id"], t2["id"]]
        assert len(items[0]["assignees"]) == 2
        assert len(items[1]["assignees"]) == 1

    khoa = client_as(app, KHOA)
    assert khoa.get(f"/api/v1/orders/{order_id}/tasks").status_code == 200

    seed(db, DUC)  # active TECHNICIAN, never assigned to this order
    duc = client_as(app, DUC)
    problem(duc.get(f"/api/v1/orders/{order_id}/tasks"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-DSP-014")
@pytest.mark.ac("AC-DSP-057")
def test_routes_declare_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/tasks" in r[1]}
    assert routes == {
        ("POST", "/api/v1/orders/{order_id}/tasks", "task.manage"),
        ("GET", "/api/v1/orders/{order_id}/tasks", "order.read"),
        ("PATCH", "/api/v1/orders/{order_id}/tasks/{task_id}", "task.manage"),
        ("GET", "/api/v1/orders/{order_id}/tasks/{task_id}", "task.read"),
        ("POST", "/api/v1/orders/{order_id}/tasks/{task_id}/assignees", "task.manage"),
        ("POST", "/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{assignment_id}/remove", "task.manage"),
        ("POST", "/api/v1/orders/{order_id}/tasks/{task_id}/cancel", "task.manage"),
    }
    assert {"not_already_active_assignee", "task_not_cancelled"} <= set(GUARDS)
    assert not {"not_already_active_assignee", "task_not_cancelled"} & set(PENDING_GUARDS)


# ---------------- order_has_no_tasks / assigned scope, now wired for real ----------------


@pytest.mark.ac("AC-ORD-115")
def test_recall_and_cancel_unblocked_when_no_tasks(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_l = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-115L")
    hoa = client_as(app, HOA)

    recall_res = hoa.post(f"/api/v1/orders/{order_l}/recall", json={"version": 1})
    assert recall_res.status_code == 200, recall_res.text
    assert recall_res.json()["status"] == "DRAFT"

    order_m = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-115M")
    cancel_res = hoa.post(f"/api/v1/orders/{order_m}/cancel", json={"version": 1, "reason": "Khách đổi ý"})
    assert cancel_res.status_code == 200, cancel_res.text
    assert cancel_res.json()["status"] == "CANCELLED"


@pytest.mark.ac("AC-ORD-116")
def test_recall_and_cancel_invalid_transition_after_first_task(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-116")
    tuan = client_as(app, TUAN)
    created = tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)).json()
    assert created["order_status"] == "IN_PROGRESS"

    hoa = client_as(app, HOA)
    problem(
        hoa.post(f"/api/v1/orders/{order_id}/recall", json={"version": created["order_version"]}),
        409,
        "INVALID_TRANSITION",
    )
    problem(
        hoa.post(
            f"/api/v1/orders/{order_id}/cancel",
            json={"version": created["order_version"], "reason": "Khách đổi ý"},
        ),
        409,
        "INVALID_TRANSITION",
    )


@pytest.mark.ac("AC-ORD-117")
def test_technician_assigned_scope_on_orders(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-117")
    tuan = client_as(app, TUAN)
    tuan.post(
        f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people, assignee_ids=[str(people["NV014"])])
    )

    khoa = client_as(app, KHOA)
    list_res = khoa.get("/api/v1/orders")
    assert list_res.status_code == 200, list_res.text
    assert str(order_id) in [item["id"] for item in list_res.json()["items"]]
    assert khoa.get(f"/api/v1/orders/{order_id}").status_code == 200

    other_order = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-117B")
    problem(khoa.get(f"/api/v1/orders/{other_order}"), 404, "NOT_FOUND")


# ---------------- task update / add / remove assignee / cancel (M4-02a) ----------------


def set_order_status(db: Connection, order_id: uuid.UUID, status: str) -> None:
    db.execute(text("UPDATE orders SET status = :status WHERE id = :id"), {"status": status, "id": order_id})


def cancel_task_directly(db: Connection, task_id: uuid.UUID) -> None:
    db.execute(
        text(
            "UPDATE tasks SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'seed'"
            " WHERE id = :id"
        ),
        {"id": task_id},
    )


def assignee_id_of(body: dict[str, Any], employee_id: uuid.UUID) -> str:
    return next(a["id"] for a in body["assignees"] if a["employee_id"] == str(employee_id))


@pytest.mark.ac("AC-DSP-038")
def test_update_task(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0038")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(
            people, title="Lắp 4 camera", assignee_ids=[str(people["NV014"]), str(people["NV015"])]
        ),
    ).json()
    task_id = created["id"]

    res = tuan.patch(
        f"/api/v1/orders/{order_id}/tasks/{task_id}",
        json={
            "version": created["order_version"],
            "title": "Lắp 4 camera + đầu ghi",
            "estimated_hours": "6",
            "due_at": "2026-10-07T09:00:00+07:00",
        },
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["title"] == "Lắp 4 camera + đầu ghi"
    assert Decimal(str(body["estimated_hours"])) == Decimal("6")
    assert body["due_at"].startswith("2026-10-07T09:00:00")
    assert body["description"] == created["description"]
    assert body["priority"] == created["priority"]
    assert body["order_version"] == created["order_version"] + 1

    update_events = [e for e in audit_rows(db, uuid.UUID(task_id)) if e.action == "update"]
    assert len(update_events) == 1
    assert update_events[0].entity_type == "TASK"
    assert update_events[0].actor_id == people["NV010"]


@pytest.mark.ac("AC-DSP-040")
def test_mutations_invalid_transition_when_task_cancelled(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0040")
    tuan = client_as(app, TUAN)
    created = tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)).json()
    task_id = created["id"]
    version = created["order_version"]
    cancel_task_directly(db, uuid.UUID(task_id))
    duc_id = seed(db, DUC)

    problem(
        tuan.patch(f"/api/v1/orders/{order_id}/tasks/{task_id}", json={"version": version, "title": "x"}),
        409,
        "INVALID_TRANSITION",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
            json={"version": version, "employee_id": str(duc_id)},
        ),
        409,
        "INVALID_TRANSITION",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
            json={"version": version, "reason": "Thử lại"},
        ),
        409,
        "INVALID_TRANSITION",
    )


@pytest.mark.ac("AC-DSP-041")
def test_mutations_guard_order_in_dispatchable_state(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0041")
    tuan = client_as(app, TUAN)
    created = tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)).json()
    task_id = created["id"]
    version = created["order_version"]
    set_order_status(db, order_id, "AWAITING_CONFIRMATION")
    duc_id = seed(db, DUC)

    for res in (
        tuan.patch(f"/api/v1/orders/{order_id}/tasks/{task_id}", json={"version": version, "title": "x"}),
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
            json={"version": version, "employee_id": str(duc_id)},
        ),
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
            json={"version": version, "reason": "Khách đổi ý"},
        ),
    ):
        assert problem(res, 409, "GUARD_FAILED")["guard"] == "order_in_dispatchable_state"


@pytest.mark.ac("AC-DSP-042")
def test_add_assignee(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0042")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"]), str(people["NV015"])]),
    ).json()
    task_id = created["id"]
    duc_id = seed(db, DUC)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": created["order_version"], "employee_id": str(duc_id)},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["assignees"]) == 3
    new_assignee = next(a for a in body["assignees"] if a["employee_id"] == str(duc_id))
    assert new_assignee["status"] == "PENDING"
    assert body["status"] == "PENDING_ACCEPTANCE"
    assert body["order_version"] == created["order_version"] + 1

    add_events = [e for e in audit_rows(db, uuid.UUID(task_id)) if e.action == "add_assignee"]
    assert len(add_events) == 1
    assert add_events[0].entity_type == "TASK"


@pytest.mark.ac("AC-DSP-043")
def test_add_assignee_guard_not_already_active(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0043")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"])]),
    ).json()
    task_id = created["id"]

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": created["order_version"], "employee_id": str(people["NV014"])},
    )

    assert problem(res, 409, "GUARD_FAILED")["guard"] == "not_already_active_assignee"


@pytest.mark.ac("AC-DSP-044")
def test_add_assignee_guard_assignees_are_active_technicians(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0044")
    tuan = client_as(app, TUAN)
    created = tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)).json()
    task_id = created["id"]
    version = created["order_version"]

    inactive = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": version, "employee_id": str(people["NV016"])},  # Lan, is_active=false
    )
    assert problem(inactive, 409, "GUARD_FAILED")["guard"] == "assignees_are_active_technicians"

    not_technician = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": version, "employee_id": str(people["NV001"])},  # An, MANAGER
    )
    assert problem(not_technician, 409, "GUARD_FAILED")["guard"] == "assignees_are_active_technicians"


@pytest.mark.ac("AC-DSP-045")
def test_remove_assignee(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0045")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"]), str(people["NV015"])]),
    ).json()
    task_id = created["id"]
    duc_id = seed(db, DUC)
    added = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": created["order_version"], "employee_id": str(duc_id)},
    ).json()
    duc_assignment_id = assignee_id_of(added, duc_id)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{duc_assignment_id}/remove",
        json={"version": added["order_version"]},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert {a["employee_id"] for a in body["assignees"]} == {str(people["NV014"]), str(people["NV015"])}
    assert body["status"] == "PENDING_ACCEPTANCE"
    assert body["order_version"] == added["order_version"] + 1

    remove_events = [e for e in audit_rows(db, uuid.UUID(duc_assignment_id)) if e.action == "remove"]
    assert len(remove_events) == 1
    assert (remove_events[0].entity_type, remove_events[0].from_status, remove_events[0].to_status) == (
        "ASSIGNMENT",
        "PENDING",
        "REMOVED",
    )


@pytest.mark.ac("AC-DSP-046")
def test_remove_last_active_assignee_sets_needs_assignee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0046")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"])]),
    ).json()
    task_id = created["id"]
    khoa_assignment_id = assignee_id_of(created, people["NV014"])

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{khoa_assignment_id}/remove",
        json={"version": created["order_version"]},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["assignees"] == []
    assert body["status"] == "NEEDS_ASSIGNEE"

    order_res = tuan.get(f"/api/v1/orders/{order_id}")
    assert order_res.json()["status"] == "IN_PROGRESS"


@pytest.mark.ac("AC-DSP-047")
def test_remove_assignment_invalid_transition_when_already_removed(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0047")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"])]),
    ).json()
    task_id = created["id"]
    khoa_assignment_id = assignee_id_of(created, people["NV014"])
    removed = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{khoa_assignment_id}/remove",
        json={"version": created["order_version"]},
    ).json()

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{khoa_assignment_id}/remove",
        json={"version": removed["order_version"]},
    )

    problem(res, 409, "INVALID_TRANSITION")


@pytest.mark.ac("AC-DSP-048")
def test_cancel_task(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0048")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"]), str(people["NV015"])]),
    ).json()
    task_id = created["id"]

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
        json={"version": created["order_version"], "reason": "Khách đổi lịch, không cần lắp nữa"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "CANCELLED"
    assert body["assignees"] == []
    assert body["order_version"] == created["order_version"] + 1

    order_res = tuan.get(f"/api/v1/orders/{order_id}")
    assert order_res.json()["status"] == "IN_PROGRESS"

    rows = (
        db.execute(text("SELECT status, removed_at FROM assignments WHERE task_id = :id"), {"id": task_id})
        .mappings()
        .all()
    )
    assert len(rows) == 2
    assert all(r["status"] == "REMOVED" and r["removed_at"] is not None for r in rows)

    cancel_events = [e for e in audit_rows(db, uuid.UUID(task_id)) if e.action == "cancel"]
    assert len(cancel_events) == 1
    assert (cancel_events[0].entity_type, cancel_events[0].to_status) == ("TASK", "CANCELLED")


@pytest.mark.ac("AC-DSP-049")
def test_cancel_task_guard_reason_present(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0049")
    tuan = client_as(app, TUAN)
    created = tuan.post(f"/api/v1/orders/{order_id}/tasks", json=_valid_body(people)).json()
    task_id = created["id"]
    version = created["order_version"]

    short = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel", json={"version": version, "reason": "ok"}
    )
    assert problem(short, 409, "GUARD_FAILED")["guard"] == "reason_present"

    blank = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel", json={"version": version, "reason": "   "}
    )
    assert problem(blank, 409, "GUARD_FAILED")["guard"] == "reason_present"


@pytest.mark.ac("AC-DSP-050")
def test_task_mutation_rbac(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0050")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"])]),
    ).json()
    task_id = created["id"]
    version = created["order_version"]

    for person in (HOA, AN, KHOA):
        client = client_as(app, person)
        problem(
            client.patch(
                f"/api/v1/orders/{order_id}/tasks/{task_id}", json={"version": version, "title": "x"}
            ),
            403,
            "FORBIDDEN",
        )
        problem(
            client.post(
                f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
                json={"version": version, "employee_id": str(people["NV014"])},
            ),
            403,
            "FORBIDDEN",
        )
        problem(
            client.post(
                f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
                json={"version": version, "reason": "Không cần nữa"},
            ),
            403,
            "FORBIDDEN",
        )

    ok = tuan.patch(
        f"/api/v1/orders/{order_id}/tasks/{task_id}", json={"version": version, "title": "Việc mới"}
    )
    assert ok.status_code == 200, ok.text


@pytest.mark.ac("AC-DSP-051")
def test_task_mutation_stale_version(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0051")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"])]),
    ).json()
    task_id = created["id"]
    stale = created["order_version"] - 1
    khoa_assignment_id = assignee_id_of(created, people["NV014"])
    duc_id = seed(db, DUC)

    problem(
        tuan.patch(f"/api/v1/orders/{order_id}/tasks/{task_id}", json={"version": stale, "title": "x"}),
        409,
        "STALE_VERSION",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
            json={"version": stale, "employee_id": str(duc_id)},
        ),
        409,
        "STALE_VERSION",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{khoa_assignment_id}/remove",
            json={"version": stale},
        ),
        409,
        "STALE_VERSION",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
            json={"version": stale, "reason": "Không cần nữa"},
        ),
        409,
        "STALE_VERSION",
    )


@pytest.mark.ac("AC-DSP-052")
def test_task_mutation_not_found_wrong_order_or_task(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_d = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0052D")
    order_f = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0052F")
    tuan = client_as(app, TUAN)
    created = tuan.post(f"/api/v1/orders/{order_d}/tasks", json=_valid_body(people)).json()
    task_id = created["id"]
    version = created["order_version"]
    duc_id = seed(db, DUC)

    problem(
        tuan.patch(f"/api/v1/orders/{order_f}/tasks/{task_id}", json={"version": 1, "title": "x"}),
        404,
        "NOT_FOUND",
    )
    problem(tuan.get(f"/api/v1/orders/{order_f}/tasks/{task_id}"), 404, "NOT_FOUND")
    problem(
        tuan.post(
            f"/api/v1/orders/{order_f}/tasks/{task_id}/assignees",
            json={"version": 1, "employee_id": str(duc_id)},
        ),
        404,
        "NOT_FOUND",
    )

    random_task = uuid.uuid4()
    problem(
        tuan.patch(f"/api/v1/orders/{order_d}/tasks/{random_task}", json={"version": version, "title": "x"}),
        404,
        "NOT_FOUND",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_d}/tasks/{random_task}/assignees",
            json={"version": version, "employee_id": str(duc_id)},
        ),
        404,
        "NOT_FOUND",
    )
    problem(
        tuan.post(
            f"/api/v1/orders/{order_d}/tasks/{random_task}/cancel",
            json={"version": version, "reason": "Không cần nữa"},
        ),
        404,
        "NOT_FOUND",
    )
    problem(tuan.get(f"/api/v1/orders/{order_d}/tasks/{random_task}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-DSP-053")
def test_get_task_detail(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0053")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"]), str(people["NV015"])]),
    ).json()
    task_id = created["id"]
    duc_id = seed(db, DUC)
    tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": created["order_version"], "employee_id": str(duc_id)},
    )

    for person in (TUAN, AN):
        client = client_as(app, person)
        res = client.get(f"/api/v1/orders/{order_id}/tasks/{task_id}")
        assert res.status_code == 200, res.text
        body = res.json()
        assert len(body["assignees"]) == 3
        ids = {a["id"] for a in body["assignees"]}
        assert len(ids) == 3
        for a in body["assignees"]:
            assert a.keys() >= {"id", "employee_id", "full_name", "status"}


@pytest.mark.ac("AC-DSP-054")
def test_get_task_detail_technician_scope(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-0054")
    tuan = client_as(app, TUAN)
    created = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json=_valid_body(people, assignee_ids=[str(people["NV014"])]),
    ).json()
    task_id = created["id"]

    khoa = client_as(app, KHOA)
    assert khoa.get(f"/api/v1/orders/{order_id}/tasks/{task_id}").status_code == 200

    seed(db, DUC)  # active TECHNICIAN, never assigned to this task
    duc = client_as(app, DUC)
    problem(duc.get(f"/api/v1/orders/{order_id}/tasks/{task_id}"), 404, "NOT_FOUND")
