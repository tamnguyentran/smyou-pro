"""M5-01: `GET /api/v1/assignments/me` (AC-ASG-001…007)."""

import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, seed
from tests.integration.test_dispatch_api import HOA, MINH, TUAN, client_as, insert_order, problem
from tests.integration.test_dispatch_board_api import insert_assignment, insert_task

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH)}


def set_service_address(db: Connection, order_id: uuid.UUID, address: str) -> None:
    db.execute(
        text("UPDATE orders SET service_address = :address WHERE id = :id"),
        {"address": address, "id": order_id},
    )


def items_by_assignment(res: Any) -> dict[str, dict[str, Any]]:
    assert res.status_code == 200, res.text
    return {item["assignment_id"]: item for item in res.json()["items"]}


@pytest.mark.ac("AC-ASG-001")
def test_my_assignments_returns_own_sorted_by_due_at(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-0012")
    set_service_address(db, order, "45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM")

    t1 = insert_task(
        db,
        order,
        code="DH2610-0012-T1",
        title="Lắp 4 camera ngoài trời",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="3.5",
    )
    a1 = insert_assignment(db, t1, people["NV014"], "PENDING")

    t2 = insert_task(
        db,
        order,
        code="DH2610-0012-T2",
        title="Kiểm tra đầu ghi",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=datetime(2026, 10, 8, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    a2 = insert_assignment(db, t2, people["NV014"], "ACCEPTED")

    t3 = insert_task(
        db,
        order,
        code="DH2610-0012-T3",
        title="Thay dây mạng",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=datetime(2026, 10, 10, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    a3 = insert_assignment(db, t3, people["NV014"], "IN_PROGRESS")

    t4 = insert_task(
        db,
        order,
        code="DH2610-0012-T4",
        title="Hướng dẫn sử dụng",
        status="DONE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 7, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    a4 = insert_assignment(db, t4, people["NV014"], "DONE")
    insert_assignment(db, t4, people["NV015"], "DONE")  # Minh also done on T4 — must not appear for Khoa

    khoa = client_as(app, KHOA)
    res = khoa.get("/api/v1/assignments/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert [item["assignment_id"] for item in body["items"]] == [
        str(a4),
        str(a2),
        str(a1),
        str(a3),
    ]

    item1 = items_by_assignment(res)[str(a1)]
    assert item1["task_id"] == str(t1)
    assert item1["task_code"] == "DH2610-0012-T1"
    assert item1["task_title"] == "Lắp 4 camera ngoài trời"
    assert float(item1["estimated_hours"]) == 3.5
    assert item1["priority"] == "NORMAL"
    assert item1["order_id"] == str(order)
    assert item1["order_code"] == "DH2610-0012"
    assert item1["service_address"] == "45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM"

    item4 = items_by_assignment(res)[str(a4)]
    assert item4["assignment_status"] == "DONE"


@pytest.mark.ac("AC-ASG-002")
def test_my_assignments_excludes_rejected_and_removed(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-0020")
    t_pending = insert_task(
        db,
        order,
        code="DH2610-0020-T1",
        title="Lắp đặt",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t_pending, people["NV014"], "PENDING")

    t_rejected = insert_task(
        db,
        order,
        code="DH2610-0020-T2",
        title="Sửa máy in",
        status="NEEDS_ASSIGNEE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t_rejected, people["NV014"], "REJECTED")

    t_removed = insert_task(
        db,
        order,
        code="DH2610-0020-T3",
        title="Khảo sát",
        status="NEEDS_ASSIGNEE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t_removed, people["NV014"], "REMOVED")

    khoa = client_as(app, KHOA)
    items = items_by_assignment(khoa.get("/api/v1/assignments/me"))
    assert {item["task_code"] for item in items.values()} == {"DH2610-0020-T1"}


@pytest.mark.ac("AC-ASG-003")
def test_my_assignments_no_idor_only_own_rows(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-0030")
    t_khoa = insert_task(
        db,
        order,
        code="DH2610-0030-T1",
        title="Lắp đặt cho Khoa",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t_khoa, people["NV014"], "PENDING")

    t_minh = insert_task(
        db,
        order,
        code="DH2610-0030-T2",
        title="Lắp đặt cho Minh",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t_minh, people["NV015"], "PENDING")

    minh = client_as(app, MINH)
    items = items_by_assignment(minh.get("/api/v1/assignments/me"))
    assert {item["task_code"] for item in items.values()} == {"DH2610-0030-T2"}
    # No query param exists to ask for someone else's assignments — an unknown one is ignored.
    items_with_bogus_param = items_by_assignment(
        minh.get(f"/api/v1/assignments/me?employee_id={people['NV014']}")
    )
    assert {item["task_code"] for item in items_with_bogus_param.values()} == {"DH2610-0030-T2"}


@pytest.mark.ac("AC-ASG-004")
def test_my_assignments_excludes_previous_cycle_after_reopen(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-0040")
    t5 = insert_task(
        db,
        order,
        code="DH2610-0040-T5",
        title="Sửa camera",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    # Cycle 1: Khoa already DONE (frozen by reopen).
    insert_assignment(db, t5, people["NV014"], "DONE")
    # reopen() bumps the task's cycle and opens a new PENDING assignment for cycle 2 — the old
    # cycle-1 row keeps cycle=1, so both can coexist under the active-cycle unique index.
    db.execute(text("UPDATE tasks SET cycle = 2 WHERE id = :t"), {"t": t5})
    new_assignment_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by)"
            " VALUES (:id, :task_id, :employee_id, 2, 'PENDING', :employee_id)"
        ),
        {"id": new_assignment_id, "task_id": t5, "employee_id": people["NV014"]},
    )

    khoa = client_as(app, KHOA)
    items = items_by_assignment(khoa.get("/api/v1/assignments/me"))
    assert set(items) == {str(new_assignment_id)}
    assert items[str(new_assignment_id)]["assignment_status"] == "PENDING"


@pytest.mark.ac("AC-ASG-005")
def test_my_assignments_forbidden_for_sale_manager_tech_lead(
    app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    for person in (HOA, AN, TUAN):
        client = client_as(app, person)
        problem(client.get("/api/v1/assignments/me"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-ASG-006")
def test_my_assignments_route_declares_capability(app: FastAPI) -> None:
    assert ("GET", "/api/v1/assignments/me", "assignment.respond") in declared_routes(app)


@pytest.mark.ac("AC-ASG-007")
def test_pending_assignments_counter_is_real(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-0050")
    for i in range(2):
        t = insert_task(
            db,
            order,
            code=f"DH2610-0050-T{i + 1}",
            title="Lắp đặt",
            status="PENDING_ACCEPTANCE",
            priority="NORMAL",
            due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
            created_by=people["NV010"],
        )
        insert_assignment(db, t, people["NV014"], "PENDING")

    t_accepted = insert_task(
        db,
        order,
        code="DH2610-0050-T3",
        title="Đã nhận",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=datetime(2026, 10, 9, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t_accepted, people["NV015"], "ACCEPTED")

    khoa = client_as(app, KHOA)
    minh = client_as(app, MINH)
    khoa_me = khoa.get("/api/v1/me")
    minh_me = minh.get("/api/v1/me")
    assert khoa_me.json()["counters"]["pending_assignments_count"] == 2
    assert minh_me.json()["counters"]["pending_assignments_count"] == 0
