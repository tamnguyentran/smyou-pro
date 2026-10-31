"""M18-01b: popup cho khối "Đầu việc theo trạng thái", "Nhân sự kỹ thuật", "Việc của tôi"
(AC-DASH-086…097) — mở rộng `/dashboard/cards/{card}/items|export` của M18-01a."""

import csv
import io
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, FakeClock, Person, seed
from tests.integration.test_dashboard_cards_api import HA, LINH, items
from tests.integration.test_dispatch_api import DUC, HOA, MINH, TUAN, client_as, insert_order, problem
from tests.integration.test_dispatch_board_api import insert_task

# FakeClock mặc định: 2026-09-26T02:00:00Z (= 09:00 giờ VN).
YESTERDAY = datetime(2026, 9, 25, 2, 0, tzinfo=UTC)
TOMORROW = datetime(2026, 9, 27, 2, 0, tzinfo=UTC)
BINH = Person("binh.ktv@smyou.vn", "Binh@SmYou26", ("TECHNICIAN",), "NV027", "Lý Văn Bình", "TECHNICAL")

STAFF_ROW_KEYS = {
    "employee_id",
    "employee_code",
    "full_name",
    "phone",
    "open_assignment_count",
    "in_progress_assignment_count",
}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    ids = {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, DUC, MINH, LINH)}
    ids[BINH.code] = seed(db, BINH, is_active=False)
    return ids


def order(db: Connection, people: dict[str, uuid.UUID], code: str, status: str = "IN_PROGRESS") -> uuid.UUID:
    return insert_order(db, created_by=people["NV001"], status=status, code=code, customer_name=f"KH {code}")


def task(
    db: Connection,
    people: dict[str, uuid.UUID],
    order_id: uuid.UUID,
    code: str,
    status: str,
    due_at: datetime = TOMORROW,
) -> uuid.UUID:
    return insert_task(
        db,
        order_id,
        code=code,
        title=f"Việc {code}",
        status=status,
        priority="NORMAL",
        due_at=due_at,
        created_by=people["NV010"],
    )


def assign(
    db: Connection,
    task_id: uuid.UUID,
    employee_id: uuid.UUID,
    status: str,
    *,
    cycle: int = 1,
    done_at: datetime | None = None,
) -> None:
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by, done_at)"
            " VALUES (:id, :task_id, :employee_id, :cycle, :status, :employee_id, :done_at)"
        ),
        {
            "id": uuid.uuid4(),
            "task_id": task_id,
            "employee_id": employee_id,
            "cycle": cycle,
            "status": status,
            "done_at": done_at,
        },
    )


def codes(data: dict[str, Any]) -> list[str]:
    key = {"order": "order_items", "task": "task_items", "staff": "staff_items"}[data["kind"]]
    field = {"order": "order_code", "task": "task_code", "staff": "employee_code"}[data["kind"]]
    return [r[field] for r in data[key]]


def _seed_all(db: Connection, people: dict[str, uuid.UUID]) -> None:
    """Mỗi thẻ trong 16 thẻ có ≥1 bản ghi thuộc và bản ghi gần giống nhưng không thuộc."""
    duc, khoa, binh = people["NV017"], people["NV014"], people["NV027"]
    o1 = order(db, people, "DH2609-0001")
    o2 = order(db, people, "DH2609-0002", "AWAITING_CONFIRMATION")
    o3 = order(db, people, "DH2609-0003", "AWAITING_CONFIRMATION")

    assign(db, task(db, people, o1, "T-NEEDS", "NEEDS_ASSIGNEE"), khoa, "REJECTED")
    pending = task(db, people, o1, "T-PENDING", "PENDING_ACCEPTANCE")
    assign(db, pending, duc, "PENDING")
    assign(db, pending, khoa, "PENDING")
    assign(db, task(db, people, o1, "T-ACC-LATE", "ACCEPTED", YESTERDAY), duc, "ACCEPTED")
    in_progress = task(db, people, o1, "T-IP", "IN_PROGRESS")
    assign(db, in_progress, duc, "IN_PROGRESS")
    assign(db, in_progress, khoa, "REMOVED")
    assign(db, task(db, people, o1, "T-IP-BINH", "IN_PROGRESS"), binh, "IN_PROGRESS")
    today = datetime(2026, 9, 26, 1, 0, tzinfo=UTC)  # 08:00 giờ VN hôm nay
    assign(db, task(db, people, o2, "T-DONE-TODAY", "DONE"), duc, "DONE", done_at=today)
    assign(db, task(db, people, o1, "T-DONE-YDAY", "DONE"), duc, "DONE", done_at=YESTERDAY)
    assign(db, task(db, people, o3, "T-DONE-KHOA", "DONE"), khoa, "DONE", done_at=today)
    task(db, people, o1, "T-CANCELLED", "CANCELLED")
    # Đầu việc đã mở lại sang chu kỳ 2: phân công chu kỳ 1 của Đức không còn là "việc của tôi".
    reopened = task(db, people, o1, "T-REOPENED", "NEEDS_ASSIGNEE", YESTERDAY)
    db.execute(text("UPDATE tasks SET cycle = 2 WHERE id = :id"), {"id": reopened})
    assign(db, reopened, duc, "ACCEPTED", cycle=1)


_DASHBOARD_NUMBER: dict[str, Callable[[dict[str, Any]], int]] = {
    **{
        f"task.{s}": (lambda d, s=s: d["task_summary"]["counts_by_status"][s])
        for s in ("NEEDS_ASSIGNEE", "PENDING_ACCEPTANCE", "ACCEPTED", "IN_PROGRESS", "DONE", "CANCELLED")
    },
    **{
        f"staff.{s}": (lambda d, s=s: d["staff_summary"]["counts_by_status"][s])
        for s in ("IN_PROGRESS", "NOT_STARTED", "IDLE")
    },
    "staff.pending_acceptance": lambda d: d["staff_summary"]["pending_acceptance_count"],
    "mine.pending": lambda d: d["my_task_summary"]["pending_count"],
    "mine.active": lambda d: d["my_task_summary"]["active_count"],
    "mine.done_today": lambda d: d["my_task_summary"]["done_today_count"],
    "mine.not_started": lambda d: d["my_task_summary"]["not_started_count"],
    "mine.overdue": lambda d: d["my_task_summary"]["overdue_count"],
    "mine.awaiting_confirmation": lambda d: d["my_task_summary"]["awaiting_confirmation_count"],
}


def _expected_kind(card: str) -> str:
    if card in {"staff.IN_PROGRESS", "staff.NOT_STARTED", "staff.IDLE"}:
        return "staff"
    return "order" if card == "mine.awaiting_confirmation" else "task"


@pytest.mark.ac("AC-DASH-086")
@pytest.mark.parametrize("card", list(_DASHBOARD_NUMBER))
def test_card_total_matches_dashboard_number(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], card: str
) -> None:
    _seed_all(db, people)
    viewers = [DUC] if card.startswith("mine.") else [AN, TUAN]
    for person in viewers:
        client = client_as(app, person)
        dashboard = client.get("/api/v1/dashboard").json()
        data = items(client, card, page_size=100)
        expected = _DASHBOARD_NUMBER[card](dashboard)
        assert expected > 0, f"seed must give {card} a non-zero count"
        assert data["total"] == expected, (person.code, card)
        assert data["kind"] == _expected_kind(card)
        assert len(codes(data)) == expected
        if data["kind"] == "staff":
            assert all(set(r) == STAFF_ROW_KEYS for r in data["staff_items"])
            assert BINH.code not in codes(data)
        if card.startswith("mine.") and data["kind"] == "task":
            assert "T-REOPENED" not in codes(data)
            assert "T-DONE-YDAY" not in codes(data)
            assert "T-DONE-KHOA" not in codes(data)


@pytest.mark.ac("AC-DASH-087")
def test_task_status_card_sorted_by_due_with_current_assignees(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    o = order(db, people, "DH2610-0010")
    due = {n: datetime(2026, 10, 30, 2, 0, tzinfo=UTC) + timedelta(days=n - 1) for n in range(1, 5)}
    ids = {n: task(db, people, o, f"ĐV2610-010{n}", "IN_PROGRESS", due[n]) for n in (3, 1, 4, 2)}
    assign(db, ids[4], people["NV014"], "IN_PROGRESS")
    assign(db, ids[4], people["NV015"], "IN_PROGRESS")
    assign(db, ids[4], people["NV017"], "REJECTED")
    task(db, people, o, "ĐV2610-0199", "DONE")

    data = items(client_as(app, TUAN), "task.IN_PROGRESS")
    assert data["total"] == 4
    assert codes(data) == ["ĐV2610-0101", "ĐV2610-0102", "ĐV2610-0103", "ĐV2610-0104"]
    last = data["task_items"][3]
    assert last["assignee_names"] == [KHOA.full_name, MINH.full_name]
    assert last["assignment_status"] is None


@pytest.mark.ac("AC-DASH-088")
def test_staff_cards_list_active_technicians(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    o = order(db, people, "DH2610-0020")
    khoa, duc, minh, binh = people["NV014"], people["NV017"], people["NV015"], people["NV027"]
    assign(db, task(db, people, o, "T-K1", "IN_PROGRESS"), khoa, "IN_PROGRESS")
    assign(db, task(db, people, o, "T-K2", "ACCEPTED"), khoa, "ACCEPTED")
    assign(db, task(db, people, o, "T-D1", "PENDING_ACCEPTANCE"), duc, "PENDING")
    assign(db, task(db, people, o, "T-D2", "PENDING_ACCEPTANCE"), duc, "PENDING")
    assign(db, task(db, people, o, "T-M1", "DONE"), minh, "DONE")
    assign(db, task(db, people, o, "T-B1", "IN_PROGRESS"), binh, "IN_PROGRESS")

    an = client_as(app, AN)
    expected = {
        "staff.IN_PROGRESS": (KHOA, 2, 1),
        "staff.NOT_STARTED": (DUC, 2, 0),
        "staff.IDLE": (MINH, 0, 0),
    }
    for card, (person, open_count, in_progress_count) in expected.items():
        data = items(an, card)
        assert data["kind"] == "staff"
        assert data["total"] == 1, card
        row = data["staff_items"][0]
        assert set(row) == STAFF_ROW_KEYS
        assert row["employee_code"] == person.code
        assert row["full_name"] == person.full_name
        assert row["open_assignment_count"] == open_count
        assert row["in_progress_assignment_count"] == in_progress_count


@pytest.mark.ac("AC-DASH-088")
def test_staff_rows_sorted_by_name(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    data = items(client_as(app, TUAN), "staff.IDLE")
    names = [r["full_name"] for r in data["staff_items"]]
    assert names == sorted(names)
    assert set(names) == {KHOA.full_name, DUC.full_name, MINH.full_name}


@pytest.mark.ac("AC-DASH-089")
def test_pending_acceptance_counts_tasks(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    o = order(db, people, "DH2610-0030")
    shared = task(db, people, o, "T-P0", "PENDING_ACCEPTANCE")
    assign(db, shared, people["NV014"], "PENDING")
    assign(db, shared, people["NV017"], "PENDING")
    for n in range(1, 4):
        assign(db, task(db, people, o, f"T-P{n}", "PENDING_ACCEPTANCE"), people["NV015"], "PENDING")

    tuan = client_as(app, TUAN)
    data = items(tuan, "staff.pending_acceptance")
    dashboard = tuan.get("/api/v1/dashboard").json()
    assert data["kind"] == "task"
    assert data["total"] == 4 == dashboard["staff_summary"]["pending_acceptance_count"]
    assert sorted(codes(data)) == ["T-P0", "T-P1", "T-P2", "T-P3"]


@pytest.mark.ac("AC-DASH-090")
def test_my_cards_only_list_callers_assignments(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    o = order(db, people, "DH2610-0040")
    duc, khoa = people["NV017"], people["NV014"]
    today = datetime(2026, 9, 26, 1, 0, tzinfo=UTC)
    assign(db, task(db, people, o, "A1", "PENDING_ACCEPTANCE"), duc, "PENDING")
    assign(db, task(db, people, o, "A2", "ACCEPTED", YESTERDAY), duc, "ACCEPTED")
    assign(db, task(db, people, o, "A3", "IN_PROGRESS"), duc, "IN_PROGRESS")
    assign(db, task(db, people, o, "A4", "DONE"), duc, "DONE", done_at=today)
    assign(db, task(db, people, o, "A5", "DONE"), duc, "DONE", done_at=YESTERDAY)
    assign(db, task(db, people, o, "A6", "NEEDS_ASSIGNEE"), duc, "REJECTED")
    for n, status in enumerate(("PENDING", "ACCEPTED", "IN_PROGRESS", "DONE", "ACCEPTED")):
        task_status = {"PENDING": "PENDING_ACCEPTANCE"}.get(status, status)
        due = YESTERDAY if n == 4 else TOMORROW
        done_at = today if status == "DONE" else None
        assign(db, task(db, people, o, f"K{n}", task_status, due), khoa, status, done_at=done_at)

    client = client_as(app, DUC)
    expected = {
        "mine.pending": ["A1"],
        "mine.active": ["A2", "A3"],
        "mine.not_started": ["A2"],
        "mine.overdue": ["A2"],
        "mine.done_today": ["A4"],
    }
    statuses = {"A1": "PENDING", "A2": "ACCEPTED", "A3": "IN_PROGRESS", "A4": "DONE"}
    for card, want in expected.items():
        data = items(client, card)
        assert data["kind"] == "task"
        assert codes(data) == want, card
        assert [r["assignment_status"] for r in data["task_items"]] == [statuses[c] for c in want]


@pytest.mark.ac("AC-DASH-091")
def test_my_awaiting_confirmation_orders_with_prices(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    mine = order(db, people, "DH2610-0021", "AWAITING_CONFIRMATION")
    other = order(db, people, "DH2610-0022", "AWAITING_CONFIRMATION")
    db.execute(text("UPDATE orders SET total = 3500000 WHERE id = :id"), {"id": mine})
    assign(db, task(db, people, mine, "T-21", "DONE"), people["NV017"], "DONE", done_at=YESTERDAY)
    assign(db, task(db, people, other, "T-22", "DONE"), people["NV014"], "DONE", done_at=YESTERDAY)

    data = items(client_as(app, DUC), "mine.awaiting_confirmation")
    assert data["kind"] == "order"
    assert data["total"] == 1
    assert codes(data) == ["DH2610-0021"]
    assert data["order_items"][0]["total"] == 3_500_000
    assert isinstance(data["order_items"][0]["total"], int)


@pytest.mark.ac("AC-DASH-092")
def test_sale_plus_technician_sees_both_blocks(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    ha = seed(db, HA)
    o = insert_order(db, created_by=ha, status="IN_PROGRESS", code="DH2610-HA1")
    assign(db, task(db, people, o, "T-HA", "IN_PROGRESS"), ha, "IN_PROGRESS")
    assign(db, task(db, people, o, "T-KHOA", "IN_PROGRESS"), people["NV014"], "IN_PROGRESS")

    client = client_as(app, HA)
    assert items(client, "order.IN_PROGRESS")["total"] == 1
    assert codes(items(client, "mine.active")) == ["T-HA"]


@pytest.mark.ac("AC-DASH-093")
def test_roles_without_the_block_get_404(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    khoa = client_as(app, KHOA)
    problem(khoa.get("/api/v1/dashboard/cards/task.DONE/items"), 404, "NOT_FOUND")
    problem(khoa.get("/api/v1/dashboard/cards/staff.IDLE/items"), 404, "NOT_FOUND")
    problem(client_as(app, HOA).get("/api/v1/dashboard/cards/task.IN_PROGRESS/items"), 404, "NOT_FOUND")
    problem(client_as(app, LINH).get("/api/v1/dashboard/cards/staff.IN_PROGRESS/items"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-DASH-094")
def test_my_cards_need_technician_role(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for person in (TUAN, AN):
        client = client_as(app, person)
        problem(client.get("/api/v1/dashboard/cards/mine.pending/items"), 404, "NOT_FOUND")
        problem(client.get("/api/v1/dashboard/cards/mine.pending/export"), 404, "NOT_FOUND")


def _csv(raw: bytes) -> list[list[str]]:
    content = raw.decode("utf-8")
    assert content.startswith("﻿")
    return list(csv.reader(io.StringIO(content[1:])))


@pytest.mark.ac("AC-DASH-095")
def test_export_staff_card(
    db: Connection, app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 10, 29, 17, 45, tzinfo=UTC)  # = 30/10 giờ VN
    # Ràng buộc DB chỉ nhận 0xxxxxxxxx; bỏ tạm trong transaction test (rollback) để chứng minh lớp
    # chống CSV injection vẫn chặn được nếu dữ liệu cũ/nhập ngoài có dạng "+84…".
    db.execute(text("ALTER TABLE employees DROP CONSTRAINT ck_employees_phone"))
    db.execute(text("UPDATE employees SET phone = '+84912345678' WHERE id = :id"), {"id": people["NV014"]})
    o = order(db, people, "DH2610-0050")
    for code in ("NV014", "NV015", "NV017"):
        assign(db, task(db, people, o, f"T-{code}", "IN_PROGRESS"), people[code], "IN_PROGRESS")

    res = client_as(app, TUAN).get("/api/v1/dashboard/cards/staff.IN_PROGRESS/export")
    assert res.status_code == 200, res.text
    assert (
        res.headers["content-disposition"] == 'attachment; filename="tong-quan-ktv-dang-lam-2026-10-30.csv"'
    )
    table = _csv(res.content)
    assert table[0] == ["Mã NV", "Họ tên", "SĐT", "Số việc đang mở", "Số việc đang làm"]
    assert len(table) == 4
    khoa = next(r for r in table[1:] if r[0] == "NV014")
    assert khoa[1] == KHOA.full_name
    assert khoa[2] == "'+84912345678"
    assert khoa[3:] == ["1", "1"]


@pytest.mark.ac("AC-DASH-096")
def test_export_my_card(db: Connection, app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]) -> None:
    clock.now = datetime(2026, 10, 29, 17, 45, tzinfo=UTC)
    o = order(db, people, "DH2610-0060")
    due = datetime(2026, 10, 31, 3, 30, tzinfo=UTC)  # = 31/10/2026 10:30 giờ VN
    assign(db, task(db, people, o, "T-60A", "ACCEPTED", due), people["NV017"], "ACCEPTED")
    assign(
        db,
        task(db, people, o, "T-60B", "IN_PROGRESS", due + timedelta(days=1)),
        people["NV017"],
        "IN_PROGRESS",
    )

    res = client_as(app, DUC).get("/api/v1/dashboard/cards/mine.active/export")
    assert res.status_code == 200, res.text
    assert (
        res.headers["content-disposition"]
        == 'attachment; filename="tong-quan-viec-cua-toi-dang-lam-2026-10-30.csv"'
    )
    table = _csv(res.content)
    assert table[0] == ["Mã đầu việc", "Đầu việc", "Mã đơn", "Khách hàng", "Hạn", "Trạng thái"]
    assert table[1:] == [
        ["T-60A", "Việc T-60A", "DH2610-0060", "KH DH2610-0060", "31/10/2026 10:30", "Đã nhận"],
        ["T-60B", "Việc T-60B", "DH2610-0060", "KH DH2610-0060", "01/11/2026 10:30", "Đang làm"],
    ]


@pytest.mark.ac("AC-DASH-097")
def test_export_over_limit_but_list_still_pages(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    o = order(db, people, "DH2610-0070")
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, created_by)"
            " SELECT gen_random_uuid(), :order_id, 'T-BULK-' || lpad(g::text, 5, '0'), 'Việc', 'INITIAL', 0,"
            " 'DONE', 1, :due_at, 'NORMAL', :created_by FROM generate_series(1, 5001) AS g"
        ),
        {"order_id": o, "due_at": YESTERDAY, "created_by": people["NV010"]},
    )

    tuan = client_as(app, TUAN)
    body = problem(tuan.get("/api/v1/dashboard/cards/task.DONE/export"), 409, "EXPORT_TOO_LARGE")
    assert body["detail"] == "Quá nhiều dòng để xuất (tối đa 5.000)."
    data = items(tuan, "task.DONE", page=2)
    assert data["total"] == 5001
    assert len(data["task_items"]) == 20
