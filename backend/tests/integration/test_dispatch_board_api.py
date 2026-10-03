"""M4-03a: company-wide task board API (AC-DSP-070…081).

Tasks are seeded directly in the DB (not through `create_task`/`cancel_task`/`remove_assignee`)
because this endpoint is read-only and some target statuses (`DONE`, forced `IN_PROGRESS`) are not
reachable through any command that exists before M5 — same "seed thẳng DB" idiom already used by
`test_dispatch_api.py` (`cancel_task_directly`, `set_order_status`).
"""

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

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")


def insert_task(
    db: Connection,
    order_id: uuid.UUID,
    *,
    code: str,
    title: str,
    status: str,
    priority: str,
    due_at: datetime,
    created_by: uuid.UUID,
    estimated_hours: str = "1",
) -> uuid.UUID:
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, created_by)"
            " VALUES (:id, :order_id, :code, :title, 'INITIAL', 0, :status, :hours, :due_at,"
            " :priority, :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": code,
            "title": title,
            "status": status,
            "hours": estimated_hours,
            "due_at": due_at,
            "priority": priority,
            "created_by": created_by,
        },
    )
    return task_id


def insert_assignment(db: Connection, task_id: uuid.UUID, employee_id: uuid.UUID, status: str) -> uuid.UUID:
    assignment_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by)"
            " VALUES (:id, :task_id, :employee_id, 1, :status, :employee_id)"
        ),
        {"id": assignment_id, "task_id": task_id, "employee_id": employee_id, "status": status},
    )
    return assignment_id


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH)}


@pytest.fixture
def board(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    order_d = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-D01")
    order_n = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-N01")
    order_o = insert_order(db, created_by=people["NV005"], status="AWAITING_CONFIRMATION", code="DH2610-O01")

    t1 = insert_task(
        db,
        order_d,
        code="DH2610-D01-T1",
        title="Lắp đặt 4 camera tầng 1",
        status="PENDING_ACCEPTANCE",
        priority="HIGH",
        due_at=datetime(2026, 10, 5, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t1, people["NV014"], "PENDING")

    t2 = insert_task(
        db,
        order_d,
        code="DH2610-D01-T2",
        title="Kiểm tra đầu ghi",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=datetime(2026, 10, 6, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t2, people["NV014"], "ACCEPTED")
    insert_assignment(db, t2, people["NV015"], "IN_PROGRESS")

    t5 = insert_task(
        db,
        order_d,
        code="DH2610-D01-T5",
        title="Kiểm tra lại camera cổng",
        status="CANCELLED",
        priority="NORMAL",
        due_at=datetime(2026, 10, 7, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t5, people["NV014"], "REMOVED")

    t3 = insert_task(
        db,
        order_n,
        code="DH2610-N01-T3",
        title="Thay dây mạng tầng 2",
        status="NEEDS_ASSIGNEE",
        priority="URGENT",
        due_at=datetime(2026, 10, 4, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t3, people["NV015"], "REMOVED")

    t4 = insert_task(
        db,
        order_o,
        code="DH2610-O01-T4",
        title="Hướng dẫn sử dụng",
        status="DONE",
        priority="LOW",
        due_at=datetime(2026, 10, 1, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(db, t4, people["NV015"], "DONE")

    return {
        "order_d": order_d,
        "order_n": order_n,
        "order_o": order_o,
        "t1": t1,
        "t2": t2,
        "t3": t3,
        "t4": t4,
        "t5": t5,
    }


def items_by_id(res: Any) -> dict[str, dict[str, Any]]:
    assert res.status_code == 200, res.text
    return {item["id"]: item for item in res.json()["items"]}


@pytest.mark.ac("AC-DSP-070")
def test_list_tasks_no_filter_returns_everything(
    app: FastAPI, board: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    items = items_by_id(tuan.get("/api/v1/tasks"))

    assert set(items) == {str(board[k]) for k in ("t1", "t2", "t3", "t4", "t5")}

    t1 = items[str(board["t1"])]
    assert t1["order_id"] == str(board["order_d"])
    assert t1["order_code"] == "DH2610-D01"
    assert {a["employee_id"] for a in t1["assignees"]} == {str(people["NV014"])}

    t2 = items[str(board["t2"])]
    assert {a["employee_id"] for a in t2["assignees"]} == {str(people["NV014"]), str(people["NV015"])}

    assert items[str(board["t3"])]["assignees"] == []  # Minh's assignment there was REMOVED
    assert {a["employee_id"] for a in items[str(board["t4"])]["assignees"]} == {str(people["NV015"])}
    assert items[str(board["t5"])]["assignees"] == []  # Khoa's assignment there was REMOVED


@pytest.mark.ac("AC-DSP-071")
def test_list_tasks_filter_by_status(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    items = items_by_id(tuan.get("/api/v1/tasks?status=NEEDS_ASSIGNEE"))
    assert set(items) == {str(board["t3"])}


@pytest.mark.ac("AC-DSP-072")
def test_list_tasks_filter_by_assignee_active_only(
    app: FastAPI, board: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    items = items_by_id(tuan.get(f"/api/v1/tasks?assignee_id={people['NV014']}"))
    assert set(items) == {str(board["t1"]), str(board["t2"])}  # T5 excluded: Khoa's row there is REMOVED


@pytest.mark.ac("AC-DSP-073")
def test_list_tasks_filter_by_priority(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    items = items_by_id(tuan.get("/api/v1/tasks?priority=URGENT"))
    assert set(items) == {str(board["t3"])}


@pytest.mark.ac("AC-DSP-074")
def test_list_tasks_filter_by_due_range(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    items = items_by_id(tuan.get("/api/v1/tasks?due_from=2026-10-05&due_to=2026-10-06"))
    assert set(items) == {str(board["t1"]), str(board["t2"])}


@pytest.mark.ac("AC-DSP-075")
def test_list_tasks_filters_combine_with_and(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    items = items_by_id(tuan.get("/api/v1/tasks?status=PENDING_ACCEPTANCE&priority=HIGH"))
    assert set(items) == {str(board["t1"])}


@pytest.mark.ac("AC-DSP-076")
def test_list_tasks_manager_sees_all_scope(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    items = items_by_id(an.get("/api/v1/tasks"))
    assert set(items) == {str(board[k]) for k in ("t1", "t2", "t3", "t4", "t5")}


@pytest.mark.ac("AC-DSP-077")
def test_list_tasks_technician_scope_includes_removed_history(
    app: FastAPI, board: dict[str, uuid.UUID]
) -> None:
    khoa = client_as(app, KHOA)
    items = items_by_id(khoa.get("/api/v1/tasks"))
    # scope `assigned` reuses TASK_RULES/_task_assigned_clause (Q61): every task Khoa ever had an
    # assignment on, including the REMOVED one on T5 — not just currently-active assignments.
    assert set(items) == {str(board["t1"]), str(board["t2"]), str(board["t5"])}


@pytest.mark.ac("AC-DSP-078")
def test_list_tasks_technician_assignee_filter_intersects_scope(
    app: FastAPI, board: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    khoa = client_as(app, KHOA)
    items = items_by_id(khoa.get(f"/api/v1/tasks?assignee_id={people['NV015']}"))
    # T2: Minh is actively assigned there and T2 is in Khoa's scope -> visible.
    # T4: Minh is actively assigned there too, but T4 is outside Khoa's scope -> must not leak.
    assert set(items) == {str(board["t2"])}


@pytest.mark.ac("AC-DSP-079")
def test_list_tasks_forbidden_without_capability(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    problem(hoa.get("/api/v1/tasks"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-DSP-080")
def test_list_tasks_route_declares_capability(app: FastAPI) -> None:
    assert ("GET", "/api/v1/tasks", "task.read") in declared_routes(app)


@pytest.mark.ac("AC-DSP-081")
def test_list_tasks_validation_errors(app: FastAPI, board: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    problem(tuan.get("/api/v1/tasks?due_from=2026-10-10&due_to=2026-10-01"), 422, "VALIDATION_ERROR")
    problem(tuan.get("/api/v1/tasks?priority=KHAC"), 422, "VALIDATION_ERROR")
    problem(tuan.get("/api/v1/tasks?assignee_id=khong-phai-uuid"), 422, "VALIDATION_ERROR")
    problem(tuan.get("/api/v1/tasks?status=HOAN_THANH"), 422, "VALIDATION_ERROR")
