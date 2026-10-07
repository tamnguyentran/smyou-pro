"""M4-04: per-technician workload summary API (AC-DSP-093…100).

Tasks/assignments are seeded directly in the DB (not through `create_task`/`cancel_task`)
for the same reason as `test_dispatch_board_api.py`: this endpoint is read-only and some
target statuses (`DONE`) are not reachable through any command that exists before M5.
"""

import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, seed
from tests.integration.test_dispatch_api import HOA, MINH, TUAN, client_as, insert_order, problem
from tests.integration.test_dispatch_board_api import insert_assignment, insert_task

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

LAN = Person("lan.do@smyou.vn", "Lan@SmYou26", ("TECHNICIAN",), "NV016", "Đỗ Thị Lan", "TECHNICAL")
DUNG = Person("dung.ho@smyou.vn", "Dung@SmYou26", ("TECHNICIAN",), "NV018", "Hồ Văn Dũng", "TECHNICAL")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    ids = {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH, DUNG)}
    ids[LAN.code] = seed(db, LAN, is_active=False)
    return ids


@pytest.fixture
def workload(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-W01")

    t1 = insert_task(
        db,
        order,
        code="DH2610-W01-T1",
        title="Lắp đặt camera",
        status="PENDING_ACCEPTANCE",
        priority="HIGH",
        due_at=datetime(2026, 10, 5, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="3.0",
    )
    insert_assignment(db, t1, people["NV014"], "PENDING")

    t2 = insert_task(
        db,
        order,
        code="DH2610-W01-T2",
        title="Kiểm tra đầu ghi",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=datetime(2026, 10, 6, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="5.0",
    )
    insert_assignment(db, t2, people["NV014"], "ACCEPTED")
    insert_assignment(db, t2, people["NV015"], "IN_PROGRESS")

    t3 = insert_task(
        db,
        order,
        code="DH2610-W01-T3",
        title="Thay dây mạng",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=datetime(2026, 10, 7, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="4.0",
    )
    insert_assignment(db, t3, people["NV014"], "DONE")
    insert_assignment(db, t3, people["NV015"], "IN_PROGRESS")

    t4 = insert_task(
        db,
        order,
        code="DH2610-W01-T4",
        title="Việc đã huỷ",
        status="CANCELLED",
        priority="LOW",
        due_at=datetime(2026, 10, 8, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="2.0",
    )
    insert_assignment(db, t4, people["NV014"], "REMOVED")

    t5 = insert_task(
        db,
        order,
        code="DH2610-W01-T5",
        title="Lan còn treo",
        status="PENDING_ACCEPTANCE",
        priority="LOW",
        due_at=datetime(2026, 10, 3, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="1.5",
    )
    insert_assignment(db, t5, people["NV016"], "PENDING")

    return {"t1": t1, "t2": t2, "t3": t3, "t4": t4, "t5": t5}


def items_by_employee(res: Any) -> dict[str, dict[str, Any]]:
    assert res.status_code == 200, res.text
    return {item["employee_id"]: item for item in res.json()["items"]}


@pytest.mark.ac("AC-DSP-093")
def test_workload_lists_active_technicians_sorted_by_hours(
    app: FastAPI, workload: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    res = tuan.get("/api/v1/tasks/workload")
    assert res.status_code == 200, res.text
    rows = res.json()["items"]

    assert [r["employee_id"] for r in rows] == [
        str(people["NV018"]),
        str(people["NV014"]),
        str(people["NV015"]),
    ]
    assert [float(r["total_estimated_hours"]) for r in rows] == [0, 8.0, 9.0]
    assert str(people["NV016"]) not in {r["employee_id"] for r in rows}  # Lan: is_active=False


@pytest.mark.ac("AC-DSP-094")
def test_workload_khoa_row_excludes_cancelled_counts_open_only(
    app: FastAPI, workload: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    rows = items_by_employee(tuan.get("/api/v1/tasks/workload"))
    khoa = rows[str(people["NV014"])]

    assert khoa["open_task_count"] == 2
    assert float(khoa["total_estimated_hours"]) == 8.0
    assert datetime.fromisoformat(khoa["nearest_due_at"]) == datetime(2026, 10, 5, 9, 0, tzinfo=VIETNAM)


@pytest.mark.ac("AC-DSP-095")
def test_workload_minh_row_counts_by_own_assignment_not_task_status(
    app: FastAPI, workload: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    rows = items_by_employee(tuan.get("/api/v1/tasks/workload"))
    minh = rows[str(people["NV015"])]

    assert minh["open_task_count"] == 2
    assert float(minh["total_estimated_hours"]) == 9.0
    assert datetime.fromisoformat(minh["nearest_due_at"]) == datetime(2026, 10, 6, 9, 0, tzinfo=VIETNAM)


@pytest.mark.ac("AC-DSP-096")
def test_workload_employee_with_no_assignments_shows_zeroes(
    app: FastAPI, workload: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    rows = items_by_employee(tuan.get("/api/v1/tasks/workload"))
    dung = rows[str(people["NV018"])]

    assert dung["open_task_count"] == 0
    assert float(dung["total_estimated_hours"]) == 0
    assert dung["nearest_due_at"] is None


@pytest.mark.ac("AC-DSP-097")
def test_workload_manager_sees_all_scope(
    app: FastAPI, workload: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    tuan = client_as(app, TUAN)
    assert an.get("/api/v1/tasks/workload").json() == tuan.get("/api/v1/tasks/workload").json()


@pytest.mark.ac("AC-DSP-098")
def test_workload_forbidden_without_capability(app: FastAPI, workload: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    problem(hoa.get("/api/v1/tasks/workload"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-DSP-099")
def test_workload_technician_scope_sees_only_own_row(
    app: FastAPI, workload: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    khoa = client_as(app, KHOA)
    rows = items_by_employee(khoa.get("/api/v1/tasks/workload"))

    assert set(rows) == {str(people["NV014"])}
    assert rows[str(people["NV014"])]["open_task_count"] == 2
    assert float(rows[str(people["NV014"])]["total_estimated_hours"]) == 8.0


@pytest.mark.ac("AC-DSP-100")
def test_workload_route_declares_capability(app: FastAPI) -> None:
    assert ("GET", "/api/v1/tasks/workload", "task.read") in declared_routes(app)
