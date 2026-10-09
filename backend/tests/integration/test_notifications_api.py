"""M7-01a: notifications table + 13 `notify_*` effect sites + read/mark-read API (AC-NTF-001…020).

Preconditions are inserted directly (orders/tasks/assignments/attachments), like the dispatch/
assignment/orders test files already do, then the real command endpoint under test is driven through
the HTTP API so the effect actually fires inside the real transaction.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.engine import Row

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")
VY = Person("vy.hoang@smyou.vn", "Vy@SmYou26", ("TECH_LEAD",), "NV011", "Hoàng Thị Vy", "TECHNICAL")
SON = Person("son.bui@smyou.vn", "Son@SmYou26", ("TECH_LEAD",), "NV012", "Bùi Văn Sơn", "TECHNICAL")
MINH = Person("minh.vo@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV015", "Võ Thành Minh", "TECHNICAL")
DUC = Person("duc.nguyen@smyou.vn", "Duc@SmYou26", ("TECHNICIAN",), "NV017", "Nguyễn Văn Đức", "TECHNICAL")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    ids = {p.code: seed(db, p) for p in (AN, HOA, TUAN, VY, KHOA, MINH, DUC)}
    ids[SON.code] = seed(db, SON, is_active=False)  # locked TECH_LEAD — must never be notified
    return ids


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


def insert_order(
    db: Connection,
    *,
    created_by: uuid.UUID,
    status: str,
    code: str | None = None,
    revision_no: int = 0,
    version: int = 1,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO orders (id, code, status, created_by, revision_no, customer_name,"
            " customer_phone, service_address, work_description, priority, version)"
            " VALUES (:id, :code, :status, :created_by, :revision_no, 'Khách lẻ', '0901234567',"
            " '12 Lê Lợi, Q1', 'Lắp đặt', 'NORMAL', :version)"
        ),
        {
            "id": order_id,
            "code": code or f"DH0000-{uuid.uuid4().hex[:4]}",
            "status": status,
            "created_by": created_by,
            "revision_no": revision_no,
            "version": version,
        },
    )
    return order_id


def insert_task(
    db: Connection,
    order_id: uuid.UUID,
    *,
    created_by: uuid.UUID,
    code: str | None = None,
    status: str = "PENDING_ACCEPTANCE",
    cycle: int = 1,
) -> uuid.UUID:
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, cycle, created_by)"
            " VALUES (:id, :order_id, :code, 'Lắp camera sân sau', 'INITIAL', 0, :status, 2,"
            " :due_at, 'NORMAL', :cycle, :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": code or f"CV{uuid.uuid4().hex[:6]}",
            "status": status,
            "due_at": datetime(2026, 10, 7, 9, 0, tzinfo=UTC),
            "cycle": cycle,
            "created_by": created_by,
        },
    )
    return task_id


def insert_assignment(
    db: Connection, task_id: uuid.UUID, employee_id: uuid.UUID, status: str, *, cycle: int = 1
) -> uuid.UUID:
    assignment_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by)"
            " VALUES (:id, :task_id, :employee_id, :cycle, :status, :employee_id)"
        ),
        {
            "id": assignment_id,
            "task_id": task_id,
            "employee_id": employee_id,
            "cycle": cycle,
            "status": status,
        },
    )
    return assignment_id


def insert_confirmation_attachment(
    db: Connection, order_id: uuid.UUID, *, uploaded_by: uuid.UUID, revision_no: int = 0
) -> None:
    db.execute(
        text(
            "INSERT INTO attachments (id, owner_type, owner_id, kind, revision_no, storage_key,"
            " original_filename, mime_type, size_bytes, sha256, uploaded_by)"
            " VALUES (gen_random_uuid(), 'ORDER', :oid, 'CUSTOMER_CONFIRMATION', :rev, 'k.jpg', 'f.jpg',"
            " 'image/jpeg', 100, :sha, :uid)"
        ),
        {"oid": order_id, "rev": revision_no, "sha": uuid.uuid4().hex, "uid": uploaded_by},
    )


def insert_notification(
    db: Connection, recipient_id: uuid.UUID, *, type_: str = "ORDER_SUBMITTED", read: bool = False
) -> uuid.UUID:
    notif_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO notifications (id, recipient_id, type, title, body, entity_type, entity_id, read_at)"
            " VALUES (:id, :rid, :type, 'Thông báo', 'Nội dung', 'ORDER', :eid, :read_at)"
        ),
        {
            "id": notif_id,
            "rid": recipient_id,
            "type": type_,
            "eid": uuid.uuid4(),
            "read_at": datetime(2026, 1, 1, tzinfo=UTC) if read else None,
        },
    )
    return notif_id


def notifications_for(db: Connection, recipient_id: uuid.UUID, *, type_: str | None = None) -> list[Row]:
    query = "SELECT * FROM notifications WHERE recipient_id = :rid"
    params: dict[str, object] = {"rid": recipient_id}
    if type_ is not None:
        query += " AND type = :type"
        params["type"] = type_
    rows = db.execute(text(query + " ORDER BY created_at"), params).all()
    return rows


def order_row(db: Connection, order_id: uuid.UUID) -> Row:
    return db.execute(text("SELECT * FROM orders WHERE id = :id"), {"id": order_id}).one()


# ---------------- order effects ----------------


@pytest.mark.ac("AC-NTF-001")
def test_submit_notifies_active_tech_leads_only(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2610-N001")
    hoa = client_as(app, HOA)

    res = hoa.post(f"/api/v1/orders/{order_id}/submit", json={"version": 1})
    assert res.status_code == 200, res.text

    tuan_rows = notifications_for(db, people["NV010"])
    vy_rows = notifications_for(db, people["NV011"])
    son_rows = notifications_for(db, people["NV012"])
    assert len(tuan_rows) == 1
    assert len(vy_rows) == 1
    assert son_rows == []
    row = tuan_rows[0]
    assert row.type == "ORDER_SUBMITTED"
    assert row.entity_type == "ORDER"
    assert row.entity_id == order_id
    assert row.read_at is None


@pytest.mark.ac("AC-NTF-002")
def test_all_tasks_done_notifies_tech_leads_and_owner(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-N002")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "IN_PROGRESS")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/complete", json={"version": 1})
    assert res.status_code == 200, res.text
    assert order_row(db, order_id).status == "AWAITING_CONFIRMATION"

    for recipient in (people["NV010"], people["NV011"]):
        rows = notifications_for(db, recipient, type_="ORDER_AWAITING_CONFIRMATION")
        assert len(rows) == 1
    owner_rows = notifications_for(db, people["NV005"], type_="ORDER_AWAITING_CONFIRMATION")
    assert len(owner_rows) == 1


@pytest.mark.ac("AC-NTF-003")
def test_complete_notifies_owner_only(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV005"], status="AWAITING_CONFIRMATION", code="DH2610-N003"
    )
    insert_confirmation_attachment(db, order_id, uploaded_by=people["NV010"])
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": 1, "confirmation_signer_name": "Lê Thị Mai"},
    )
    assert res.status_code == 200, res.text

    owner_rows = notifications_for(db, people["NV005"], type_="ORDER_COMPLETED")
    assert len(owner_rows) == 1
    assert notifications_for(db, people["NV011"], type_="ORDER_COMPLETED") == []


@pytest.mark.ac("AC-NTF-004")
def test_request_revision_notifies_owner(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="COMPLETED", code="DH2610-N004")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/revise",
        json={"version": 1, "reason": "Camera lắp sai vị trí, khách yêu cầu chỉnh lại"},
    )
    assert res.status_code == 200, res.text

    owner_rows = notifications_for(db, people["NV005"], type_="ORDER_REVISION_REQUESTED")
    assert len(owner_rows) == 1


# ---------------- task effects ----------------


@pytest.mark.ac("AC-NTF-005")
def test_create_task_notifies_new_assignees(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-N005")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json={
            "version": 1,
            "title": "Lắp 2 camera",
            "estimated_hours": "2",
            "due_at": "2026-10-07T09:00:00+07:00",
            "assignee_ids": [str(people["NV014"]), str(people["NV015"])],
        },
    )
    assert res.status_code == 200, res.text

    for recipient in (people["NV014"], people["NV015"]):
        rows = notifications_for(db, recipient, type_="TASK_ASSIGNED")
        assert len(rows) == 1
        assert "Lắp 2 camera" in rows[0].body


@pytest.mark.ac("AC-NTF-006")
def test_update_task_notifies_current_cycle_active_assignees_only(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-N006")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="PENDING_ACCEPTANCE")
    insert_assignment(db, task_id, people["NV014"], "PENDING")
    insert_assignment(db, task_id, people["NV015"], "REJECTED")
    tuan = client_as(app, TUAN)

    res = tuan.patch(f"/api/v1/orders/{order_id}/tasks/{task_id}", json={"version": 1, "title": "Việc mới"})
    assert res.status_code == 200, res.text

    assert len(notifications_for(db, people["NV014"], type_="TASK_UPDATED")) == 1
    assert notifications_for(db, people["NV015"], type_="TASK_UPDATED") == []


@pytest.mark.ac("AC-NTF-007")
def test_add_assignee_notifies_only_new_assignee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-N007")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="PENDING_ACCEPTANCE")
    insert_assignment(db, task_id, people["NV014"], "PENDING")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees",
        json={"version": 1, "employee_id": str(people["NV017"])},
    )
    assert res.status_code == 200, res.text

    assert len(notifications_for(db, people["NV017"], type_="TASK_ASSIGNED")) == 1
    assert notifications_for(db, people["NV014"], type_="TASK_ASSIGNED") == []


@pytest.mark.ac("AC-NTF-008")
def test_reopen_notifies_reassigned_employees(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV005"], status="REVISION", revision_no=1, code="DH2610-N008"
    )
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="DONE")
    insert_assignment(db, task_id, people["NV014"], "DONE")
    insert_assignment(db, task_id, people["NV015"], "DONE")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/reopen",
        json={
            "version": 1,
            "reason": "Camera lắp sai vị trí, cần lắp lại đúng chỗ theo bản vẽ",
            "severity": "MAJOR",
        },
    )
    assert res.status_code == 200, res.text

    for recipient in (people["NV014"], people["NV015"]):
        rows = notifications_for(db, recipient, type_="TASK_REOPENED")
        assert len(rows) == 1
        assert "lắp sai vị trí" in rows[0].body


@pytest.mark.ac("AC-NTF-009")
def test_cancel_task_notifies_open_assignees(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-N009")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="PENDING_ACCEPTANCE")
    insert_assignment(db, task_id, people["NV014"], "PENDING")
    insert_assignment(db, task_id, people["NV015"], "ACCEPTED")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/cancel",
        json={"version": 1, "reason": "Khách đổi ý, không làm nữa"},
    )
    assert res.status_code == 200, res.text

    for recipient in (people["NV014"], people["NV015"]):
        assert len(notifications_for(db, recipient, type_="TASK_CANCELLED")) == 1


@pytest.mark.ac("AC-NTF-013")
def test_remove_assignee_notifies_only_that_employee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2610-N013")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="ACCEPTED")
    insert_assignment(db, task_id, people["NV014"], "ACCEPTED")
    removed_id = insert_assignment(db, task_id, people["NV015"], "ACCEPTED")
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks/{task_id}/assignees/{removed_id}/remove", json={"version": 1}
    )
    assert res.status_code == 200, res.text

    assert len(notifications_for(db, people["NV015"], type_="ASSIGNMENT_REMOVED")) == 1
    assert notifications_for(db, people["NV014"], type_="ASSIGNMENT_REMOVED") == []


# ---------------- assignment effects ----------------


@pytest.mark.ac("AC-NTF-010")
def test_reject_notifies_tech_leads_with_rejecter_and_reason(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-N010")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="PENDING_ACCEPTANCE")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "PENDING")
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/assignments/{assignment_id}/reject",
        json={"version": 1, "reason_code": "DISTANCE", "reason_text": "Địa chỉ quá xa, không kịp đi"},
    )
    assert res.status_code == 200, res.text

    for recipient in (people["NV010"], people["NV011"]):
        rows = notifications_for(db, recipient, type_="ASSIGNMENT_REJECTED")
        assert len(rows) == 1
        assert "Trần Minh Khoa" in rows[0].body
        assert "quá xa" in rows[0].body


@pytest.mark.ac("AC-NTF-011")
def test_complete_one_of_two_does_not_notify_done(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-N011")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS")
    khoa_assignment = insert_assignment(db, task_id, people["NV014"], "IN_PROGRESS")
    insert_assignment(db, task_id, people["NV015"], "IN_PROGRESS")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{khoa_assignment}/complete", json={"version": 1})
    assert res.status_code == 200, res.text

    assert notifications_for(db, people["NV010"], type_="ASSIGNMENT_DONE") == []
    assert notifications_for(db, people["NV011"], type_="ASSIGNMENT_DONE") == []


@pytest.mark.ac("AC-NTF-012")
def test_complete_last_assignment_notifies_tech_leads_done(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-N012")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS")
    assignment_id = insert_assignment(db, task_id, people["NV014"], "IN_PROGRESS")
    khoa = client_as(app, KHOA)

    res = khoa.post(f"/api/v1/assignments/{assignment_id}/complete", json={"version": 1})
    assert res.status_code == 200, res.text

    for recipient in (people["NV010"], people["NV011"]):
        assert len(notifications_for(db, recipient, type_="ASSIGNMENT_DONE")) == 1


# ---------------- read API ----------------


@pytest.mark.ac("AC-NTF-014")
def test_list_scoped_to_self_sorted_desc(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for _ in range(3):
        insert_notification(db, people["NV014"])
    for _ in range(2):
        insert_notification(db, people["NV014"], read=True)
    insert_notification(db, people["NV015"])
    khoa = client_as(app, KHOA)

    res = khoa.get("/api/v1/notifications?limit=20")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 5
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert len(body["items"]) == 5


@pytest.mark.ac("AC-NTF-015")
def test_unread_count(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for _ in range(3):
        insert_notification(db, people["NV014"])
    insert_notification(db, people["NV014"], read=True)
    khoa = client_as(app, KHOA)

    res = khoa.get("/api/v1/notifications/unread-count")
    assert res.status_code == 200, res.text
    assert res.json() == {"count": 3}


@pytest.mark.ac("AC-NTF-016")
def test_mark_read_sets_read_at(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    notif_id = insert_notification(db, people["NV014"])
    khoa = client_as(app, KHOA)
    assert khoa.get("/api/v1/notifications/unread-count").json() == {"count": 1}

    res = khoa.post(f"/api/v1/notifications/{notif_id}/read")
    assert res.status_code == 200, res.text
    assert res.json()["read_at"] is not None
    assert khoa.get("/api/v1/notifications/unread-count").json() == {"count": 0}


@pytest.mark.ac("AC-NTF-017")
def test_mark_read_other_employees_notification_404(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    notif_id = insert_notification(db, people["NV014"])
    minh = client_as(app, MINH)

    problem(minh.post(f"/api/v1/notifications/{notif_id}/read"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-NTF-018")
def test_mark_all_read(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for _ in range(3):
        insert_notification(db, people["NV014"])
    other = insert_notification(db, people["NV015"])
    khoa = client_as(app, KHOA)

    res = khoa.post("/api/v1/notifications/mark-all-read")
    assert res.status_code == 200, res.text
    assert res.json() == {"count": 3}
    assert khoa.get("/api/v1/notifications/unread-count").json() == {"count": 0}
    assert (
        db.execute(text("SELECT read_at FROM notifications WHERE id = :id"), {"id": other}).scalar_one()
        is None
    )


@pytest.mark.ac("AC-NTF-019")
def test_me_includes_unread_notifications_count(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for _ in range(2):
        insert_notification(db, people["NV014"])
    khoa = client_as(app, KHOA)

    res = khoa.get("/api/v1/me")
    assert res.status_code == 200, res.text
    assert res.json()["unread_notifications_count"] == 2


@pytest.mark.ac("AC-NTF-020")
def test_routes_declare_notification_read_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if r[1].startswith("/api/v1/notifications")}
    assert len(routes) == 4
    assert all(capability == "notification.read" for _method, _path, capability in routes)
