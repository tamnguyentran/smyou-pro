"""M7-02: `GET /api/v1/dashboard` (AC-DASH-001…009)."""

import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, seed
from tests.integration.test_dispatch_api import DUC, HOA, MINH, TUAN, client_as, insert_order, problem
from tests.integration.test_dispatch_board_api import insert_assignment, insert_task


def insert_done_assignment(
    db: Connection, task_id: uuid.UUID, employee_id: uuid.UUID, *, done_at: datetime
) -> uuid.UUID:
    """`insert_assignment` (DONE) không set `done_at` — cần biến thể riêng cho AC-DASH-020
    (lọc "Đã xong hôm nay" theo `done_at`)."""
    assignment_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by, done_at)"
            " VALUES (:id, :task_id, :employee_id, 1, 'DONE', :employee_id, :done_at)"
        ),
        {"id": assignment_id, "task_id": task_id, "employee_id": employee_id, "done_at": done_at},
    )
    return assignment_id


VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
# Khớp FakeClock mặc định (conftest.py): 2026-09-26T02:00:00Z = 2026-09-26 09:00 giờ VN.
TODAY_VN = datetime(2026, 9, 26, 9, 0, tzinfo=VIETNAM)
YESTERDAY_VN = datetime(2026, 9, 25, 9, 0, tzinfo=VIETNAM)
TOMORROW_VN = datetime(2026, 9, 27, 9, 0, tzinfo=VIETNAM)
LAN = Person("lan2.do@smyou.vn", "Lan2@SmYou26", ("SALE", "TECH_LEAD"), "NV020", "Đỗ Thị Lan 2", "SALES")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, DUC, MINH, KHOA, LAN)}


def body(res: Any) -> dict[str, Any]:
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.ac("AC-DASH-001")
def test_order_summary_own_scope_for_sale(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for i in range(2):
        insert_order(db, created_by=people["NV005"], status="DRAFT", code=f"DH2609-H{i:02d}")
    for i in range(3):
        insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code=f"DH2609-H1{i}")
    insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-H20")
    for i in range(5):
        insert_order(db, created_by=people["NV001"], status="PENDING_DISPATCH", code=f"DH2609-A{i:02d}")

    hoa = client_as(app, HOA)
    data = body(hoa.get("/api/v1/dashboard"))
    assert data["order_summary"] == {
        "scope": "own",
        "counts_by_status": {
            "DRAFT": 2,
            "PENDING_DISPATCH": 3,
            "IN_PROGRESS": 1,
            "AWAITING_CONFIRMATION": 0,
            "COMPLETED": 0,
            "REVISION": 0,
            "CANCELLED": 0,
        },
        "overdue_count": 0,
    }
    assert "dispatch_summary" not in data
    assert "today_tasks" not in data


@pytest.mark.ac("AC-DASH-032")
def test_order_summary_overdue_count(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    order_a = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-OA1")
    insert_task(
        db,
        order_a,
        code="DH2609-OA1-T1",
        title="Quá hạn, chưa xong",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    order_b = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-OA2")
    insert_task(
        db,
        order_b,
        code="DH2609-OA2-T1",
        title="Chưa quá hạn",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    order_c = insert_order(db, created_by=people["NV005"], status="COMPLETED", code="DH2609-OA3")
    insert_task(
        db,
        order_c,
        code="DH2609-OA3-T1",
        title="Đơn đã hoàn tất, không tính",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    order_d = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-OA4")
    insert_task(
        db,
        order_d,
        code="DH2609-OA4-T1",
        title="Quá hạn nhưng task đã xong, không tính",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )

    hoa = client_as(app, HOA)
    data = body(hoa.get("/api/v1/dashboard"))
    assert data["order_summary"]["overdue_count"] == 1


@pytest.mark.ac("AC-DASH-002")
def test_dispatch_summary_pending_dispatch_count(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    for i in range(4):
        insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code=f"DH2609-P{i:02d}")

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert "order_summary" not in data
    assert data["dispatch_summary"]["pending_dispatch_count"] == 4


@pytest.mark.ac("AC-DASH-003")
def test_dispatch_summary_needs_assignee_count(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-N01")
    for i in range(3):
        insert_task(
            db,
            order,
            code=f"DH2609-N01-T{i + 1}",
            title="Cần giao lại",
            status="NEEDS_ASSIGNEE",
            priority="NORMAL",
            due_at=TOMORROW_VN,
            created_by=people["NV010"],
        )
    t_other1 = insert_task(
        db,
        order,
        code="DH2609-N01-T4",
        title="Đã tiếp nhận",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t_other1, people["NV017"], "ACCEPTED")
    t_other2 = insert_task(
        db,
        order,
        code="DH2609-N01-T5",
        title="Đang thực hiện",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t_other2, people["NV017"], "IN_PROGRESS")

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert data["dispatch_summary"]["needs_assignee_count"] == 3


@pytest.mark.ac("AC-DASH-004")
def test_dispatch_summary_overdue_task_count(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-O01")
    t1 = insert_task(
        db,
        order,
        code="DH2609-O01-T1",
        title="Quá hạn, đang làm",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t1, people["NV017"], "IN_PROGRESS")
    t2 = insert_task(
        db,
        order,
        code="DH2609-O01-T2",
        title="Chưa quá hạn",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t2, people["NV017"], "ACCEPTED")
    t3 = insert_task(
        db,
        order,
        code="DH2609-O01-T3",
        title="Đã xong",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t3, people["NV017"], "DONE")
    insert_task(
        db,
        order,
        code="DH2609-O01-T4",
        title="Đã huỷ",
        status="CANCELLED",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert data["dispatch_summary"]["overdue_task_count"] == 1


@pytest.mark.ac("AC-DASH-005")
def test_today_tasks_open_due_today_or_overdue_sorted(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-T01")
    t1 = insert_task(
        db,
        order,
        code="DH2609-T01-T1",
        title="Hôm nay, đã tiếp nhận",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TODAY_VN,
        created_by=people["NV010"],
    )
    a1 = insert_assignment(db, t1, people["NV017"], "ACCEPTED")
    t2 = insert_task(
        db,
        order,
        code="DH2609-T01-T2",
        title="Quá hạn, đang làm",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    a2 = insert_assignment(db, t2, people["NV017"], "IN_PROGRESS")
    t3 = insert_task(
        db,
        order,
        code="DH2609-T01-T3",
        title="Ngày mai",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t3, people["NV017"], "PENDING")
    t4 = insert_task(
        db,
        order,
        code="DH2609-T01-T4",
        title="Hôm nay, đã xong",
        status="DONE",
        priority="NORMAL",
        due_at=TODAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t4, people["NV017"], "DONE")

    duc = client_as(app, DUC)
    data = body(duc.get("/api/v1/dashboard"))
    assert "order_summary" not in data
    assert "dispatch_summary" not in data
    assert [item["assignment_id"] for item in data["today_tasks"]] == [str(a2), str(a1)]
    item1 = data["today_tasks"][1]
    for field in (
        "assignment_id",
        "assignment_status",
        "task_id",
        "task_code",
        "task_title",
        "task_description",
        "estimated_hours",
        "due_at",
        "priority",
        "order_id",
        "order_code",
        "customer_name",
        "customer_phone",
        "service_address",
    ):
        assert field in item1


@pytest.mark.ac("AC-DASH-006")
def test_today_tasks_empty_when_none_due(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-E01")
    t1 = insert_task(
        db,
        order,
        code="DH2609-E01-T1",
        title="Ngày mai",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t1, people["NV017"], "ACCEPTED")

    duc = client_as(app, DUC)
    data = body(duc.get("/api/v1/dashboard"))
    assert data["today_tasks"] == []


@pytest.mark.ac("AC-DASH-007")
def test_manager_sees_order_all_scope_and_dispatch_summary(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2609-M01")
    insert_order(db, created_by=people["NV001"], status="PENDING_DISPATCH", code="DH2609-M02")

    an = client_as(app, AN)
    data = body(an.get("/api/v1/dashboard"))
    assert data["order_summary"]["scope"] == "all"
    assert data["order_summary"]["counts_by_status"]["DRAFT"] == 1
    assert data["order_summary"]["counts_by_status"]["PENDING_DISPATCH"] == 1
    assert data["dispatch_summary"]["pending_dispatch_count"] == 1
    assert "today_tasks" not in data


@pytest.mark.ac("AC-DASH-008")
def test_multi_role_shows_all_applicable_sections(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    insert_order(db, created_by=people["NV020"], status="DRAFT", code="DH2609-L01")
    insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2609-L02")
    insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2609-L03")

    lan = client_as(app, LAN)
    data = body(lan.get("/api/v1/dashboard"))
    assert data["order_summary"]["scope"] == "own"
    assert data["order_summary"]["counts_by_status"]["DRAFT"] == 1
    assert data["dispatch_summary"]["pending_dispatch_count"] == 1
    assert "today_tasks" not in data


@pytest.mark.ac("AC-DASH-009")
def test_requires_authentication(app: FastAPI) -> None:
    from fastapi.testclient import TestClient

    client = TestClient(app, raise_server_exceptions=False)
    problem(client.get("/api/v1/dashboard"), 401, "UNAUTHENTICATED")


@pytest.mark.ac("AC-DASH-018")
def test_task_summary_counts_by_status(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-S01")
    for i in range(2):
        insert_task(
            db,
            order,
            code=f"DH2609-S01-T{i + 1}",
            title="Cần giao lại",
            status="NEEDS_ASSIGNEE",
            priority="NORMAL",
            due_at=TOMORROW_VN,
            created_by=people["NV010"],
        )
    t3 = insert_task(
        db,
        order,
        code="DH2609-S01-T3",
        title="Đang thực hiện",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t3, people["NV017"], "IN_PROGRESS")
    t4 = insert_task(
        db,
        order,
        code="DH2609-S01-T4",
        title="Đã xong",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t4, people["NV017"], "DONE")

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert data["task_summary"]["counts_by_status"] == {
        "NEEDS_ASSIGNEE": 2,
        "PENDING_ACCEPTANCE": 0,
        "ACCEPTED": 0,
        "IN_PROGRESS": 1,
        "DONE": 1,
        "CANCELLED": 0,
    }


@pytest.mark.ac("AC-DASH-019")
def test_staff_summary_groups_active_technicians(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-S02")
    # DUC (NV017): đang làm.
    t1 = insert_task(
        db,
        order,
        code="DH2609-S02-T1",
        title="t1",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t1, people["NV017"], "IN_PROGRESS")
    # Minh (NV015): đã tiếp nhận, chưa bắt đầu.
    t2 = insert_task(
        db,
        order,
        code="DH2609-S02-T2",
        title="t2",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t2, people["NV015"], "ACCEPTED")
    # Khoa (NV014): chưa có phân công nào.

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert data["staff_summary"] == {
        "active_technician_count": 3,
        "counts_by_status": {"IN_PROGRESS": 1, "NOT_STARTED": 1, "IDLE": 1},
        "pending_acceptance_count": 0,
    }


@pytest.mark.ac("AC-DASH-020")
def test_my_task_summary_groups_own_assignments(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-S03")
    t1 = insert_task(
        db,
        order,
        code="DH2609-S03-T1",
        title="Chờ nhận",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t1, people["NV017"], "PENDING")
    t2 = insert_task(
        db,
        order,
        code="DH2609-S03-T2",
        title="Đã tiếp nhận",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t2, people["NV017"], "ACCEPTED")
    t3 = insert_task(
        db,
        order,
        code="DH2609-S03-T3",
        title="Đang thực hiện",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t3, people["NV017"], "IN_PROGRESS")
    t4 = insert_task(
        db,
        order,
        code="DH2609-S03-T4",
        title="Xong hôm nay",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_done_assignment(db, t4, people["NV017"], done_at=datetime(2026, 9, 26, 0, 0, tzinfo=VIETNAM))
    t5 = insert_task(
        db,
        order,
        code="DH2609-S03-T5",
        title="Xong hôm qua",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_done_assignment(db, t5, people["NV017"], done_at=YESTERDAY_VN)

    duc = client_as(app, DUC)
    data = body(duc.get("/api/v1/dashboard"))
    assert data["my_task_summary"] == {
        "pending_count": 1,
        "active_count": 2,
        "done_today_count": 1,
        "not_started_count": 1,
        "overdue_count": 0,
        "awaiting_confirmation_count": 0,
    }


@pytest.mark.ac("AC-DASH-043")
def test_my_task_summary_not_started_count_excludes_in_progress(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-N01")
    t1 = insert_task(
        db,
        order,
        code="DH2609-N01-T1",
        title="Chưa bắt đầu",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t1, people["NV017"], "ACCEPTED")
    t2 = insert_task(
        db,
        order,
        code="DH2609-N01-T2",
        title="Đang thực hiện",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t2, people["NV017"], "IN_PROGRESS")
    t3 = insert_task(
        db,
        order,
        code="DH2609-N01-T3",
        title="Chờ nhận",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, t3, people["NV017"], "PENDING")

    duc = client_as(app, DUC)
    data = body(duc.get("/api/v1/dashboard"))
    assert data["my_task_summary"]["not_started_count"] == 1


@pytest.mark.ac("AC-DASH-044")
def test_my_task_summary_overdue_count_excludes_pending(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-N02")
    a1 = insert_task(
        db,
        order,
        code="DH2609-N02-T1",
        title="Quá hạn, chưa bắt đầu",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, a1, people["NV017"], "ACCEPTED")
    a2 = insert_task(
        db,
        order,
        code="DH2609-N02-T2",
        title="Quá hạn, đang làm",
        status="IN_PROGRESS",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, a2, people["NV017"], "IN_PROGRESS")
    a3 = insert_task(
        db,
        order,
        code="DH2609-N02-T3",
        title="Quá hạn, chưa tiếp nhận",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, a3, people["NV017"], "PENDING")
    a4 = insert_task(
        db,
        order,
        code="DH2609-N02-T4",
        title="Chưa quá hạn",
        status="ACCEPTED",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, a4, people["NV017"], "ACCEPTED")

    duc = client_as(app, DUC)
    data = body(duc.get("/api/v1/dashboard"))
    assert data["my_task_summary"]["overdue_count"] == 2


@pytest.mark.ac("AC-DASH-045")
def test_my_task_summary_awaiting_confirmation_count_distinct_orders(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order_x = insert_order(db, created_by=people["NV005"], status="AWAITING_CONFIRMATION", code="DH2609-N03")
    tx = insert_task(
        db,
        order_x,
        code="DH2609-N03-T1",
        title="Đã xong, chờ KH xác nhận",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_done_assignment(db, tx, people["NV017"], done_at=TODAY_VN)
    order_y = insert_order(db, created_by=people["NV005"], status="AWAITING_CONFIRMATION", code="DH2609-N04")
    ty = insert_task(
        db,
        order_y,
        code="DH2609-N04-T1",
        title="Đơn khác, không liên quan Đức",
        status="DONE",
        priority="NORMAL",
        due_at=YESTERDAY_VN,
        created_by=people["NV010"],
    )
    insert_done_assignment(db, ty, people["NV015"], done_at=TODAY_VN)

    duc = client_as(app, DUC)
    data = body(duc.get("/api/v1/dashboard"))
    assert data["my_task_summary"]["awaiting_confirmation_count"] == 1


def test_dashboard_route_declares_capability(app: FastAPI) -> None:
    assert ("GET", "/api/v1/dashboard", "dashboard.read") in declared_routes(app)


@pytest.mark.ac("AC-DASH-037")
def test_dispatch_summary_in_progress_order_count(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    for i in range(3):
        insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code=f"DH2609-I{i:02d}")
    insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2609-I10")
    insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code="DH2609-I11")

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert data["dispatch_summary"]["in_progress_order_count"] == 3


@pytest.mark.ac("AC-DASH-039")
def test_staff_summary_pending_acceptance_counts_by_task(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-W01")
    for i in range(3):
        task = insert_task(
            db,
            order,
            code=f"DH2609-W01-T{i + 1}",
            title="Chờ tiếp nhận",
            status="PENDING_ACCEPTANCE",
            priority="NORMAL",
            due_at=TOMORROW_VN,
            created_by=people["NV010"],
        )
        insert_assignment(db, task, people["NV017"], "PENDING")
    shared_task = insert_task(
        db,
        order,
        code="DH2609-W01-T4",
        title="2 KTV cùng chờ tiếp nhận",
        status="PENDING_ACCEPTANCE",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )
    insert_assignment(db, shared_task, people["NV015"], "PENDING")
    insert_assignment(db, shared_task, people["NV014"], "PENDING")
    insert_task(
        db,
        order,
        code="DH2609-W01-T5",
        title="Cần giao lại, không tính",
        status="NEEDS_ASSIGNEE",
        priority="NORMAL",
        due_at=TOMORROW_VN,
        created_by=people["NV010"],
    )

    tuan = client_as(app, TUAN)
    data = body(tuan.get("/api/v1/dashboard"))
    assert data["staff_summary"]["pending_acceptance_count"] == 4
