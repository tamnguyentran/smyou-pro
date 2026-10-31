"""M18-01a: `GET /api/v1/dashboard/cards/{card}/items|export` (AC-DASH-066…076)."""

import csv
import io
import uuid
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, FakeClock, Person, seed
from tests.integration.test_dispatch_api import HOA, TUAN, client_as, insert_order, problem
from tests.integration.test_dispatch_board_api import insert_assignment, insert_task

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
# FakeClock mặc định: 2026-09-26T02:00:00Z.
YESTERDAY = datetime(2026, 9, 25, 2, 0, tzinfo=UTC)
TOMORROW = datetime(2026, 9, 27, 2, 0, tzinfo=UTC)
LINH = Person("linh.csk@smyou.vn", "Linh@SmYou26", ("CUSTOMER_CARE",), "NV023", "Phan Thị Linh", "SALES")
HA = Person("ha.sale@smyou.vn", "Ha@SmYou26", ("SALE", "TECHNICIAN"), "NV024", "Trần Thu Hà", "SALES")
MINH_KTV = Person("minh.ktv@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV025", "Võ Thành Minh", "TECHNICAL")

ORDER_ROW_KEYS = {
    "order_id",
    "order_code",
    "customer_name",
    "customer_phone",
    "created_by_name",
    "status",
    "created_at",
    "total",
}
TASK_ROW_KEYS = {
    "task_id",
    "task_code",
    "task_title",
    "order_id",
    "order_code",
    "customer_name",
    "assignee_names",
    "due_at",
    "status",
    "assignment_status",  # M18-01b: thêm trường (null với thẻ không phải `mine.*`)
}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, LINH, HA, MINH_KTV)}


def items(client: TestClient, card: str, **params: Any) -> dict[str, Any]:
    res = client.get(f"/api/v1/dashboard/cards/{card}/items", params=params)
    assert res.status_code == 200, res.text
    data: dict[str, Any] = res.json()
    return data


def rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = data["order_items"] if data["kind"] == "order" else data["task_items"]
    return result


def at(minutes: int) -> datetime:
    return datetime(2026, 9, 20, 1, 0, tzinfo=UTC) + timedelta(minutes=minutes)


@pytest.mark.ac("AC-DASH-066")
def test_sale_sees_only_own_orders_newest_first(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    for i in range(3):
        insert_order(
            db,
            created_by=people["NV005"],
            status="PENDING_DISPATCH",
            code=f"DH2610-001{i + 1}",
            customer_name=f"Khách {i + 1}",
            customer_phone=f"090000000{i + 1}",
            created_at=at(i),
        )
    for i in range(5):
        insert_order(db, created_by=people["NV001"], status="PENDING_DISPATCH", code=f"DH2610-A{i}")

    hoa = client_as(app, HOA)
    data = items(hoa, "order.PENDING_DISPATCH")
    dashboard = hoa.get("/api/v1/dashboard").json()
    assert data["card"] == "order.PENDING_DISPATCH"
    assert data["kind"] == "order"
    assert data["total"] == 3 == dashboard["order_summary"]["counts_by_status"]["PENDING_DISPATCH"]
    assert [r["order_code"] for r in data["order_items"]] == ["DH2610-0013", "DH2610-0012", "DH2610-0011"]
    first = data["order_items"][0]
    assert set(first) == ORDER_ROW_KEYS
    assert first["customer_name"] == "Khách 3"
    assert first["customer_phone"] == "0900000003"
    assert first["created_by_name"] == HOA.full_name
    assert first["status"] == "PENDING_DISPATCH"


@pytest.mark.ac("AC-DASH-067")
def test_manager_sees_all_orders(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for i in range(3):
        insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH", code=f"DH2610-H{i}")
    for i in range(5):
        insert_order(db, created_by=people["NV001"], status="PENDING_DISPATCH", code=f"DH2610-A{i}")

    data = items(client_as(app, AN), "order.PENDING_DISPATCH")
    assert data["total"] == 8
    codes = {r["order_code"] for r in data["order_items"]}
    assert {"DH2610-H0", "DH2610-A0"} <= codes


def _seed_mixed(db: Connection, people: dict[str, uuid.UUID]) -> None:
    """Đơn mọi trạng thái của Hoa + An; đầu việc quá hạn/không quá hạn/đã xong, kể cả đầu việc
    quá hạn của đơn COMPLETED/CANCELLED (không tính vào `order.overdue`)."""
    statuses = ("DRAFT", "PENDING_DISPATCH", "IN_PROGRESS", "AWAITING_CONFIRMATION", "COMPLETED", "REVISION")
    orders: dict[str, uuid.UUID] = {}
    for n, status in enumerate((*statuses, "CANCELLED")):
        orders[status] = insert_order(db, created_by=people["NV005"], status=status, code=f"DH2609-H{n}")
        insert_order(db, created_by=people["NV001"], status=status, code=f"DH2609-A{n}")
    insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2609-A99")

    def task(order: str, code: str, status: str, due_at: datetime) -> uuid.UUID:
        return insert_task(
            db,
            orders[order],
            code=code,
            title=f"Việc {code}",
            status=status,
            priority="NORMAL",
            due_at=due_at,
            created_by=people["NV010"],
        )

    overdue = task("IN_PROGRESS", "T-OVERDUE", "ACCEPTED", YESTERDAY)
    insert_assignment(db, overdue, people["NV014"], "ACCEPTED")
    task("IN_PROGRESS", "T-NOT-DUE", "ACCEPTED", TOMORROW)
    task("IN_PROGRESS", "T-DONE-LATE", "DONE", YESTERDAY)
    task("REVISION", "T-NEEDS-1", "NEEDS_ASSIGNEE", YESTERDAY)
    task("PENDING_DISPATCH", "T-NEEDS-2", "NEEDS_ASSIGNEE", TOMORROW)
    task("COMPLETED", "T-COMPLETED-LATE", "IN_PROGRESS", YESTERDAY)
    task("CANCELLED", "T-CANCELLED-LATE", "PENDING_ACCEPTANCE", YESTERDAY)


_DASHBOARD_NUMBER: dict[str, Callable[[dict[str, Any]], int]] = {
    **{
        f"order.{s}": (lambda d, s=s: d["order_summary"]["counts_by_status"][s])
        for s in (
            "DRAFT",
            "PENDING_DISPATCH",
            "IN_PROGRESS",
            "AWAITING_CONFIRMATION",
            "COMPLETED",
            "REVISION",
            "CANCELLED",
        )
    },
    "order.overdue": lambda d: d["order_summary"]["overdue_count"],
    "dispatch.pending_dispatch": lambda d: d["dispatch_summary"]["pending_dispatch_count"],
    "dispatch.in_progress": lambda d: d["dispatch_summary"]["in_progress_order_count"],
    "dispatch.needs_assignee": lambda d: d["dispatch_summary"]["needs_assignee_count"],
    "dispatch.overdue_tasks": lambda d: d["dispatch_summary"]["overdue_task_count"],
}
_TASK_CARDS = {"dispatch.needs_assignee", "dispatch.overdue_tasks"}


@pytest.mark.ac("AC-DASH-068")
@pytest.mark.parametrize("card", list(_DASHBOARD_NUMBER))
def test_card_total_matches_dashboard_number(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], card: str
) -> None:
    _seed_mixed(db, people)
    viewers = [AN, HOA] if card.startswith("order.") else [AN, TUAN]
    for person in viewers:
        client = client_as(app, person)
        dashboard = client.get("/api/v1/dashboard").json()
        data = items(client, card, page_size=100)
        expected = _DASHBOARD_NUMBER[card](dashboard)
        assert expected > 0, f"seed must give {card} a non-zero count"
        assert data["total"] == expected, (person.code, card)
        assert len(rows(data)) == expected
        if card in _TASK_CARDS:
            assert data["kind"] == "task"
            assert data.get("order_items") is None
            assert all(set(r) == TASK_ROW_KEYS for r in data["task_items"])
        else:
            assert data["kind"] == "order"
            assert data.get("task_items") is None
            assert all(set(r) == ORDER_ROW_KEYS for r in data["order_items"])


@pytest.mark.ac("AC-DASH-068")
def test_overdue_cards_list_the_right_rows(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    _seed_mixed(db, people)
    an = client_as(app, AN)

    overdue_orders = items(an, "order.overdue")
    # H2 (IN_PROGRESS, T-OVERDUE) + H5 (REVISION, T-NEEDS-1); H4/H6 (COMPLETED/CANCELLED) bị loại.
    assert {r["order_code"] for r in overdue_orders["order_items"]} == {"DH2609-H2", "DH2609-H5"}

    overdue_tasks = items(an, "dispatch.overdue_tasks")
    by_code = {r["task_code"]: r for r in overdue_tasks["task_items"]}
    assert set(by_code) == {"T-OVERDUE", "T-NEEDS-1", "T-COMPLETED-LATE", "T-CANCELLED-LATE"}
    assert by_code["T-OVERDUE"]["assignee_names"] == [KHOA.full_name]
    assert by_code["T-OVERDUE"]["order_code"] == "DH2609-H2"
    assert by_code["T-NEEDS-1"]["assignee_names"] == []


@pytest.mark.ac("AC-DASH-069")
def test_pagination(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for i in range(45):
        insert_order(
            db, created_by=people["NV001"], status="COMPLETED", code=f"DH2610-{i:04d}", created_at=at(i)
        )

    an = client_as(app, AN)
    data = items(an, "order.COMPLETED", page=3, page_size=20)
    assert data["total"] == 45
    assert data["page"] == 3
    assert data["page_size"] == 20
    # Mới tạo trước → trang 3 là 5 đơn cũ nhất (dòng 41-45).
    assert [r["order_code"] for r in data["order_items"]] == [f"DH2610-{i:04d}" for i in (4, 3, 2, 1, 0)]

    assert (
        an.get("/api/v1/dashboard/cards/order.COMPLETED/items", params={"page_size": 101}).status_code == 422
    )
    assert an.get("/api/v1/dashboard/cards/order.COMPLETED/items", params={"page": 0}).status_code == 422


@pytest.mark.ac("AC-DASH-070")
def test_roles_without_the_section_get_404(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    khoa = client_as(app, KHOA)
    problem(khoa.get("/api/v1/dashboard/cards/order.DRAFT/items"), 404, "NOT_FOUND")
    problem(khoa.get("/api/v1/dashboard/cards/dispatch.overdue_tasks/items"), 404, "NOT_FOUND")
    linh = client_as(app, LINH)
    problem(linh.get("/api/v1/dashboard/cards/order.DRAFT/items"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-DASH-071")
def test_sale_cannot_open_dispatch_cards(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    problem(hoa.get("/api/v1/dashboard/cards/dispatch.pending_dispatch/items"), 404, "NOT_FOUND")
    # Khối đơn của chính Hoa vẫn mở được (đối chứng).
    assert hoa.get("/api/v1/dashboard/cards/order.PENDING_DISPATCH/items").status_code == 200


@pytest.mark.ac("AC-DASH-072")
def test_unauthenticated_and_unknown_card(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    anonymous = TestClient(app, raise_server_exceptions=False)
    assert anonymous.get("/api/v1/dashboard/cards/order.DRAFT/items").status_code == 401
    assert anonymous.get("/api/v1/dashboard/cards/order.DRAFT/export").status_code == 401
    an = client_as(app, AN)
    problem(an.get("/api/v1/dashboard/cards/order.FOO/items"), 404, "NOT_FOUND")
    problem(an.get("/api/v1/dashboard/cards/order.FOO/export"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-DASH-073")
def test_sale_plus_technician_is_own_scope(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    insert_order(db, created_by=people["NV024"], status="IN_PROGRESS", code="DH2610-HA1")
    insert_order(db, created_by=people["NV024"], status="IN_PROGRESS", code="DH2610-HA2")
    insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-HOA")

    ha = client_as(app, HA)
    data = items(ha, "order.IN_PROGRESS")
    dashboard = ha.get("/api/v1/dashboard").json()
    assert data["total"] == 2 == dashboard["order_summary"]["counts_by_status"]["IN_PROGRESS"]
    assert {r["order_code"] for r in data["order_items"]} == {"DH2610-HA1", "DH2610-HA2"}


def _insert_priced_order(db: Connection, created_by: uuid.UUID, code: str, total: int) -> uuid.UUID:
    order_id = insert_order(db, created_by=created_by, status="PENDING_DISPATCH", code=code)
    db.execute(text("UPDATE orders SET total = :total WHERE id = :id"), {"total": total, "id": order_id})
    return order_id


@pytest.mark.ac("AC-DASH-074")
def test_prices_hidden_without_read_prices(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], monkeypatch: pytest.MonkeyPatch
) -> None:
    _insert_priced_order(db, people["NV005"], "DH2610-P01", 12_500_000)

    tuan = client_as(app, TUAN)
    data = items(tuan, "dispatch.pending_dispatch")
    assert data["order_items"][0]["total"] == 12_500_000
    assert isinstance(data["order_items"][0]["total"], int)
    priced_csv = tuan.get("/api/v1/dashboard/cards/dispatch.pending_dispatch/export").content.decode(
        "utf-8-sig"
    )
    assert "Tổng tiền" in priced_csv.splitlines()[0]
    assert "12500000" in priced_csv

    specs = app.state.specs
    grants = dict(specs.permissions.capabilities)
    grants["order.read_prices"] = {r: s for r, s in grants["order.read_prices"].items() if r != "MANAGER"}
    monkeypatch.setattr(
        app.state,
        "specs",
        replace(specs, permissions=specs.permissions.model_copy(update={"capabilities": grants})),
    )
    an = client_as(app, AN)
    hidden = items(an, "order.PENDING_DISPATCH")
    assert hidden["order_items"][0]["total"] is None
    hidden_csv = an.get("/api/v1/dashboard/cards/order.PENDING_DISPATCH/export").content.decode("utf-8-sig")
    assert "Tổng tiền" not in hidden_csv
    assert "12500000" not in hidden_csv


@pytest.mark.ac("AC-DASH-075")
def test_export_csv(db: Connection, app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]) -> None:
    # 29/10 UTC nhưng đã là 30/10 giờ VN → tên file phải theo ngày VN. (Không dùng giờ "sau" thời
    # điểm chạy test: PyJWT từ chối `iat` ở tương lai so với giờ thật.)
    clock.now = datetime(2026, 10, 29, 17, 45, tzinfo=UTC)
    created = datetime(2026, 10, 29, 17, 30, tzinfo=UTC)  # = 30/10/2026 00:30 giờ VN
    insert_order(
        db,
        created_by=people["NV005"],
        status="IN_PROGRESS",
        code="DH2610-0001",
        customer_name='=HYPERLINK("http://x","bấm")',
        customer_phone="0901234567",
        created_at=created,
    )
    insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2610-0002", created_at=at(1))
    insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2610-0003", created_at=at(2))
    insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2610-0004")

    res = client_as(app, AN).get("/api/v1/dashboard/cards/dispatch.in_progress/export")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        res.headers["content-disposition"] == 'attachment; filename="tong-quan-dang-thuc-hien-2026-10-30.csv"'
    )
    raw = res.content.decode("utf-8")
    assert raw.startswith("﻿")
    table = list(csv.reader(io.StringIO(raw[1:])))
    assert table[0] == ["Mã đơn", "Khách hàng", "SĐT", "Người tạo", "Ngày tạo", "Tổng tiền"]
    assert len(table) == 4
    first = next(r for r in table[1:] if r[0] == "DH2610-0001")
    assert first[1] == '\'=HYPERLINK("http://x","bấm")'
    assert first[2] == "0901234567"
    assert first[3] == HOA.full_name
    assert first[4] == "30/10/2026 00:30"


def test_export_too_large(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.dashboard import cards

    monkeypatch.setattr(cards, "EXPORT_MAX_ROWS", 2)
    for i in range(3):
        insert_order(db, created_by=people["NV001"], status="DRAFT", code=f"DH2610-X{i}")
    problem(client_as(app, AN).get("/api/v1/dashboard/cards/order.DRAFT/export"), 409, "EXPORT_TOO_LARGE")


@pytest.mark.ac("AC-DASH-076")
def test_export_hidden_section_is_404(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    problem(client_as(app, KHOA).get("/api/v1/dashboard/cards/order.DRAFT/export"), 404, "NOT_FOUND")
