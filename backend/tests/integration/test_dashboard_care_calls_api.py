"""M27-02a: Tổng quan đếm "lượt gọi CSKH" gộp 2 nguồn — recheck đơn hoàn tất (`orders.csat_recorded_*`)
và cuộc gọi ở trang "Chăm sóc KH" (`customer_care_calls`) (AC-DASH-131…135, Q195)."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection

from tests.integration.conftest import AN, KHOA, FakeClock, seed
from tests.integration.test_customer_care_calls_api import insert_call, insert_customer
from tests.integration.test_dashboard_cards_api import LINH, items
from tests.integration.test_dashboard_cards_c_api import (
    AUG_31_LATE_VN,
    MAI,
    SEPT_10,
    completed,
    csv_table,
)
from tests.integration.test_dispatch_api import HOA, TUAN, client_as

# FakeClock mặc định: 2026-09-26T02:00:00Z (= 09:00 giờ VN) → "hôm nay" = 26/09, "tháng này" = 9/2026.
TODAY_RECHECK = datetime(2026, 9, 26, 1, 10, tzinfo=UTC)  # 08:10 VN
TODAY_CALL = datetime(2026, 9, 26, 1, 30, tzinfo=UTC)  # 08:30 VN
SEPT_12 = datetime(2026, 9, 12, 3, 0, tzinfo=UTC)

CARE_CALL_ROW_KEYS = {
    "source",
    "called_at",
    "customer_id",
    "customer_name",
    "customer_phone",
    "order_id",
    "order_code",
    "caller_name",
    "summary",
}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, LINH, MAI)}


@pytest.fixture
def minh_phat(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    return insert_customer(
        db, code="KH00042", name="Công ty TNHH Minh Phát", phone="0918000042", created_by=people["NV001"]
    )


def _seed_month(db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID) -> None:
    """3 recheck tháng này (1 hôm nay) + 2 cuộc gọi tháng này (1 hôm nay) + 1 cuộc gọi tháng trước.
    Tháng này — Linh: 2 recheck + 1 cuộc gọi; Mai: 1 recheck + 1 cuộc gọi."""
    completed(
        db, people, "DH2609-0041", rating=5, comment="Lắp camera gọn gàng",
        recorded_by="NV023", recorded_at=SEPT_10,
    )  # fmt: skip
    completed(db, people, "DH2609-0042", rating=3, recorded_by="NV023", recorded_at=SEPT_12)
    completed(db, people, "DH2609-0043", rating=4, recorded_by="NV028", recorded_at=TODAY_RECHECK)
    insert_call(
        db, customer_id=customer_id, caller_id=people["NV028"], offered="Bảo trì máy in định kỳ",
        customer_request="Báo giá camera kho", called_at=TODAY_CALL,
    )  # fmt: skip
    insert_call(
        db, customer_id=customer_id, caller_id=people["NV023"], offered="Hỏi thăm sau lắp đặt",
        called_at=datetime(2026, 9, 15, 3, 0, tzinfo=UTC),
    )  # fmt: skip
    insert_call(
        db,
        customer_id=customer_id,
        caller_id=people["NV023"],
        offered="Tháng trước",
        called_at=AUG_31_LATE_VN,
    )


@pytest.mark.ac("AC-DASH-131")
def test_care_summary_counts_calls_from_both_sources(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    _seed_month(db, people, minh_phat)
    data = client_as(app, AN).get("/api/v1/dashboard").json()
    assert data["care_summary"] == {"month": 5, "today": 2}


@pytest.mark.ac("AC-DASH-132")
def test_care_staff_counted_across_both_sources(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    completed(db, people, "L-1", rating=5, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "L-2", rating=4, recorded_by="NV023", recorded_at=SEPT_12)
    insert_call(db, customer_id=minh_phat, caller_id=people["NV023"], offered="Chào Linh", called_at=SEPT_12)
    mai_at = datetime(2026, 9, 20, 3, 0, tzinfo=UTC)
    insert_call(db, customer_id=minh_phat, caller_id=people["NV028"], offered="Chào Mai", called_at=mai_at)

    an = client_as(app, AN)
    assert an.get("/api/v1/dashboard").json()["care_staff_count"] == 2
    data = items(an, "care.staff")
    assert data["total"] == 2
    staff = [(r["employee_code"], r["care_count"]) for r in data["care_staff_items"]]
    assert staff == [(LINH.code, 3), (MAI.code, 1)]
    linh, mai = data["care_staff_items"]
    assert datetime.fromisoformat(linh["last_recorded_at"]) == SEPT_12
    assert datetime.fromisoformat(mai["last_recorded_at"]) == mai_at
    assert HOA.code not in [code for code, _ in staff]


@pytest.mark.ac("AC-DASH-133")
def test_care_customers_lists_calls_from_both_sources_newest_first(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    _seed_month(db, people, minh_phat)
    an = client_as(app, AN)
    month = an.get("/api/v1/dashboard").json()["care_summary"]["month"]

    data = items(an, "care.customers")
    assert data["kind"] == "care_call"
    assert data["total"] == 5 == month
    rows: list[dict[str, Any]] = data["care_call_items"]
    assert all(set(r) == CARE_CALL_ROW_KEYS for r in rows)
    assert [(r["source"], r["order_code"]) for r in rows] == [
        ("CARE_CALL", None),
        ("ORDER_RECHECK", "DH2609-0043"),
        ("CARE_CALL", None),
        ("ORDER_RECHECK", "DH2609-0042"),
        ("ORDER_RECHECK", "DH2609-0041"),
    ]
    call = rows[0]
    assert datetime.fromisoformat(call["called_at"]) == TODAY_CALL
    assert call["customer_id"] == str(minh_phat)
    assert call["customer_name"] == "Công ty TNHH Minh Phát"
    assert call["customer_phone"] == "0918000042"
    assert call["order_id"] is None
    assert call["caller_name"] == MAI.full_name
    assert call["summary"] == "Chào: Bảo trì máy in định kỳ · Yêu cầu: Báo giá camera kho"
    assert rows[2]["summary"] == "Chào: Hỏi thăm sau lắp đặt"
    recheck = rows[4]
    assert recheck["order_id"] is not None
    assert recheck["customer_name"] == "KH DH2609-0041"
    assert recheck["customer_phone"] == "0912345678"
    assert recheck["caller_name"] == LINH.full_name
    assert recheck["summary"] == "5★ — Lắp camera gọn gàng"
    assert rows[3]["summary"] == "3★"

    page_2 = items(an, "care.customers", page=2, page_size=2)["care_call_items"]
    assert [r["order_code"] for r in page_2] == [None, "DH2609-0042"]


@pytest.mark.ac("AC-DASH-134")
def test_care_customers_and_staff_export_csv(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    _seed_month(db, people, minh_phat)
    formula = insert_customer(
        db, code="KH00099", name='=HYPERLINK("x")', phone="0918000099", created_by=people["NV001"]
    )
    insert_call(
        db, customer_id=formula, caller_id=people["NV028"], offered="=1+1",
        called_at=datetime(2026, 9, 25, 3, 0, tzinfo=UTC),
    )  # fmt: skip
    an = client_as(app, AN)

    res = an.get("/api/v1/dashboard/cards/care.customers/export")
    assert res.status_code == 200, res.text
    assert "cskh-kh-da-cham-soc" in res.headers["content-disposition"]
    table = csv_table(res)
    assert table[0] == ["Thời gian", "Nguồn", "Mã đơn", "Khách hàng", "SĐT", "Nội dung", "Người gọi"]
    assert len(table) == 7
    assert table[1] == [
        "26/09/2026 08:30",
        "Cuộc gọi CSKH",
        "",
        "Công ty TNHH Minh Phát",
        "0918000042",
        "Chào: Bảo trì máy in định kỳ · Yêu cầu: Báo giá camera kho",
        MAI.full_name,
    ]
    assert table[2][:3] == ["26/09/2026 08:10", "Recheck đơn", "DH2609-0043"]
    injected = next(r for r in table[1:] if r[0] == "25/09/2026 10:00")
    assert injected[3] == '\'=HYPERLINK("x")'
    assert injected[5] == "Chào: =1+1"

    staff = csv_table(an.get("/api/v1/dashboard/cards/care.staff/export"))
    assert staff[0] == ["Mã NV", "Họ tên", "Số lượt gọi", "Lần ghi gần nhất"]
    assert staff[1:] == [
        [LINH.code, LINH.full_name, "3", "15/09/2026 10:00"],
        [MAI.code, MAI.full_name, "3", "26/09/2026 08:30"],
    ]


@pytest.mark.ac("AC-DASH-135")
def test_care_calls_month_boundary_uses_vietnam_time(
    db: Connection, app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    clock.now = datetime(2026, 10, 2, 3, 0, tzinfo=UTC)
    # 30/09 23:30 giờ VN — tháng 9 dù đã là 30/09 16:30 UTC; 01/10 00:10 giờ VN — tháng 10.
    insert_call(
        db, customer_id=minh_phat, caller_id=people["NV023"], offered="Cuối tháng 9",
        called_at=datetime(2026, 9, 30, 16, 30, tzinfo=UTC),
    )  # fmt: skip
    insert_call(
        db, customer_id=minh_phat, caller_id=people["NV028"], offered="Đầu tháng 10",
        called_at=datetime(2026, 9, 30, 17, 10, tzinfo=UTC),
    )  # fmt: skip
    an = client_as(app, AN)
    data = an.get("/api/v1/dashboard").json()
    assert data["care_summary"]["month"] == 1
    assert data["care_staff_count"] == 1
    rows = items(an, "care.customers")["care_call_items"]
    assert [r["summary"] for r in rows] == ["Chào: Đầu tháng 10"]
    assert [r["employee_code"] for r in items(an, "care.staff")["care_staff_items"]] == [MAI.code]


@pytest.mark.ac("AC-DASH-140")
def test_care_customers_call_rows_follow_call_read_permission(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    _seed_month(db, people, minh_phat)
    rechecks = [
        ("ORDER_RECHECK", "DH2609-0043"),
        ("ORDER_RECHECK", "DH2609-0042"),
        ("ORDER_RECHECK", "DH2609-0041"),
    ]

    for person in (HOA, TUAN):
        client = client_as(app, person)
        assert client.get("/api/v1/dashboard").json()["care_summary"]["month"] == 5
        data = items(client, "care.customers")
        assert data["total"] == 3
        assert [(r["source"], r["order_code"]) for r in data["care_call_items"]] == rechecks
        table = csv_table(client.get("/api/v1/dashboard/cards/care.customers/export"))
        assert [r[1] for r in table[1:]] == ["Recheck đơn"] * 3

    # M27-03 (Q197): phần "Mai chỉ thấy cuộc gọi của Mai" được AC-DASH-141 thay thế.


@pytest.mark.ac("AC-DASH-141")
def test_care_staff_see_every_care_call_row_matching_the_card(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    _seed_month(db, people, minh_phat)

    mai = client_as(app, MAI)
    month = mai.get("/api/v1/dashboard").json()["care_summary"]["month"]
    data = items(mai, "care.customers")
    assert data["total"] == 5 == month
    rows = data["care_call_items"]
    assert sorted(r["source"] for r in rows) == ["CARE_CALL"] * 2 + ["ORDER_RECHECK"] * 3
    callers = {r["caller_name"] for r in rows if r["source"] == "CARE_CALL"}
    assert callers == {MAI.full_name, LINH.full_name}
    table = csv_table(mai.get("/api/v1/dashboard/cards/care.customers/export"))
    assert len(table) == 6
    assert [r[1] for r in table[1:]].count("Cuộc gọi CSKH") == 2

    for person in (HOA, TUAN):
        data = items(client_as(app, person), "care.customers")
        assert data["total"] == 3
        assert {r["source"] for r in data["care_call_items"]} == {"ORDER_RECHECK"}
