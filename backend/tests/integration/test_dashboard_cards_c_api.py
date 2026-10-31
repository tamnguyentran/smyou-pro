"""M18-01c: popup cho khối "Chăm sóc khách hàng", "Phản hồi - đánh giá", "Top 10 khách hàng"
(AC-DASH-104…115) — mở rộng `/dashboard/cards/{card}/items|export` của M18-01a/b."""

import csv
import io
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, FakeClock, Person, seed
from tests.integration.test_dashboard_api import (
    insert_completed_order_for_customer,
    insert_customer_for_dashboard,
    insert_order_revision,
)
from tests.integration.test_dashboard_cards_api import LINH, items
from tests.integration.test_dispatch_api import HOA, TUAN, client_as, insert_order, problem

# FakeClock mặc định: 2026-09-26T02:00:00Z (= 09:00 giờ VN) → "tháng này" = 9/2026 giờ VN.
MAI = Person("mai.csk@smyou.vn", "Mai@SmYou26", ("CUSTOMER_CARE",), "NV028", "Vũ Thị Mai", "SALES")
SEPT_10 = datetime(2026, 9, 10, 3, 0, tzinfo=UTC)
AUG_29 = datetime(2026, 8, 29, 3, 0, tzinfo=UTC)
# 31/08 23:30 giờ VN — vẫn là tháng trước dù đã là 31/08 UTC tối.
AUG_31_LATE_VN = datetime(2026, 8, 31, 16, 30, tzinfo=UTC)

FEEDBACK_ROW_KEYS = {
    "order_id",
    "order_code",
    "customer_name",
    "customer_phone",
    "csat_rating",
    "csat_comment",
    "recorded_by_name",
    "recorded_at",
    "completed_at",
}
CARE_STAFF_ROW_KEYS = {"employee_id", "employee_code", "full_name", "care_count", "last_recorded_at"}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, LINH, MAI)}


def customer(db: Connection, people: dict[str, uuid.UUID], code: str, name: str) -> uuid.UUID:
    return insert_customer_for_dashboard(db, code=code, name=name, created_by=people["NV001"])


def completed(
    db: Connection,
    people: dict[str, uuid.UUID],
    code: str,
    *,
    customer_id: uuid.UUID | None = None,
    total: int = 1_000_000,
    rating: int | None = None,
    completed_at: datetime = SEPT_10,
    recorded_by: str | None = None,
    recorded_at: datetime | None = None,
    comment: str | None = None,
) -> uuid.UUID:
    order_id = insert_completed_order_for_customer(
        db,
        created_by=people["NV001"],
        customer_id=customer_id,
        total=total,
        code=code,
        csat_rating=rating,
        completed_at=completed_at,
        csat_recorded_by=people[recorded_by] if recorded_by else None,
        csat_recorded_at=recorded_at,
    )
    db.execute(
        text(
            "UPDATE orders SET csat_comment = :comment, customer_name = :name, customer_phone = '0912345678'"
            " WHERE id = :id"
        ),
        {"comment": comment, "name": f"KH {code}", "id": order_id},
    )
    return order_id


def revision(
    db: Connection, people: dict[str, uuid.UUID], order_id: uuid.UUID, no: int, at: datetime
) -> None:
    insert_order_revision(
        db, order_id=order_id, revision_no=no, requested_by=people["NV001"], requested_at=at
    )


def codes(data: dict[str, Any]) -> list[str]:
    key, field = {
        "order": ("order_items", "order_code"),
        "feedback": ("feedback_items", "order_code"),
        "care_staff": ("care_staff_items", "employee_code"),
    }[data["kind"]]
    return [r[field] for r in data[key]]


def csv_table(res: Any) -> list[list[str]]:
    raw = res.content.decode("utf-8")
    assert raw.startswith("﻿")
    return list(csv.reader(io.StringIO(raw[1:])))


def _seed_all(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    """Mỗi thẻ có ≥1 bản ghi thuộc và bản ghi gần giống nhưng không thuộc."""
    minh_phat = customer(db, people, "KH0012", "Công ty TNHH Minh Phát")
    hoang_gia = customer(db, people, "KH0031", "Nhà sách Hoàng Gia")
    completed(db, people, "F-5", customer_id=minh_phat, rating=5, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "F-3", customer_id=minh_phat, rating=3, recorded_by="NV028", recorded_at=SEPT_10)
    completed(db, people, "F-4", customer_id=hoang_gia, rating=4, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "F-2-LE", rating=2, recorded_by="NV023", recorded_at=SEPT_10)  # khách lẻ
    completed(db, people, "F-1", customer_id=hoang_gia, rating=1, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "F-NONE", customer_id=hoang_gia)
    # Hoàn tất tháng trước nhưng ghi phản hồi tháng này: thuộc care.customers, không thuộc feedback.4.
    completed(
        db, people, "F-4-AUG", customer_id=hoang_gia, rating=4, completed_at=AUG_29,
        recorded_by="NV023", recorded_at=SEPT_10,
    )  # fmt: skip
    completed(
        db, people, "F-5-AUG", customer_id=minh_phat, rating=5, completed_at=AUG_29,
        recorded_by="NV028", recorded_at=AUG_31_LATE_VN,
    )  # fmt: skip
    twice = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="R-TWICE")
    revision(db, people, twice, 1, datetime(2026, 9, 5, 3, 0, tzinfo=UTC))
    revision(db, people, twice, 2, datetime(2026, 9, 20, 3, 0, tzinfo=UTC))
    old = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="R-AUG")
    revision(db, people, old, 1, datetime(2026, 8, 28, 3, 0, tzinfo=UTC))
    return {"KH0012": minh_phat, "KH0031": hoang_gia}


def _top_number(customer_id: uuid.UUID) -> Callable[[dict[str, Any]], int]:
    def number(d: dict[str, Any]) -> int:
        return next(r["order_count"] for r in d["top_customers"] if r["customer_id"] == str(customer_id))

    return number


_DASHBOARD_NUMBER: dict[str, Callable[[dict[str, Any]], int]] = {
    "care.customers": lambda d: d["care_summary"]["month"],
    "care.staff": lambda d: d["care_staff_count"],
    "care.revision_orders": lambda d: d["orders_needing_revision_count"],
    **{f"feedback.{n}": (lambda d, n=n: d["feedback_summary"][str(n)]) for n in range(1, 6)},
}
_EXPECTED_KIND = {"care.customers": "feedback", "care.staff": "care_staff", "care.revision_orders": "order"}


@pytest.mark.ac("AC-DASH-104")
@pytest.mark.parametrize("card", [*_DASHBOARD_NUMBER, "top.KH0012", "top.KH0031"])
def test_card_total_matches_dashboard_number(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], card: str
) -> None:
    customers = _seed_all(db, people)
    if card.startswith("top."):
        customer_id = customers[card.removeprefix("top.")]
        number, card, kind = _top_number(customer_id), f"top.{customer_id}", "order"
    else:
        number, kind = _DASHBOARD_NUMBER[card], _EXPECTED_KIND.get(card, "feedback")
    for person in (AN, TUAN, HOA, LINH):
        client = client_as(app, person)
        expected = number(client.get("/api/v1/dashboard").json())
        assert expected > 0, f"seed must give {card} a non-zero count"
        data = items(client, card, page_size=100)
        assert data["total"] == expected, (person.code, card)
        assert data["kind"] == kind
        assert len(codes(data)) == expected


@pytest.mark.ac("AC-DASH-105")
def test_care_customers_lists_feedback_recorded_this_month(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    completed(
        db, people, "DH2609-0041", rating=5, comment="Lắp camera gọn gàng",
        recorded_by="NV023", recorded_at=datetime(2026, 9, 24, 7, 5, tzinfo=UTC),
    )  # fmt: skip
    completed(
        db, people, "DH2609-0042", rating=3, recorded_by="NV028",
        recorded_at=datetime(2026, 9, 26, 1, 10, tzinfo=UTC),
    )  # fmt: skip
    completed(
        db, people, "DH2608-0090", rating=4, completed_at=AUG_29,
        recorded_by="NV023", recorded_at=datetime(2026, 9, 2, 3, 0, tzinfo=UTC),
    )  # fmt: skip
    completed(
        db, people, "DH2608-0088", rating=5, completed_at=AUG_29,
        recorded_by="NV023", recorded_at=AUG_31_LATE_VN,
    )  # fmt: skip

    data = items(client_as(app, AN), "care.customers")
    assert data["kind"] == "feedback"
    assert data["total"] == 3
    assert codes(data) == ["DH2609-0042", "DH2609-0041", "DH2608-0090"]
    assert all(set(r) == FEEDBACK_ROW_KEYS for r in data["feedback_items"])
    second = data["feedback_items"][1]
    assert second["csat_rating"] == 5
    assert second["csat_comment"] == "Lắp camera gọn gàng"
    assert second["recorded_by_name"] == LINH.full_name
    assert second["customer_name"] == "KH DH2609-0041"
    assert second["customer_phone"] == "0912345678"
    assert data["feedback_items"][0]["csat_comment"] is None
    assert data["feedback_items"][0]["recorded_by_name"] == MAI.full_name


@pytest.mark.ac("AC-DASH-106")
def test_care_staff_lists_recorders_by_count(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    for n in range(4):
        completed(db, people, f"L-{n}", rating=5, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "M-0", rating=4, recorded_by="NV028", recorded_at=SEPT_10)
    completed(db, people, "L-AUG", rating=4, completed_at=AUG_29, recorded_by="NV023", recorded_at=AUG_29)

    data = items(client_as(app, TUAN), "care.staff")
    assert data["kind"] == "care_staff"
    assert data["total"] == 2
    assert codes(data) == [LINH.code, MAI.code]
    assert all(set(r) == CARE_STAFF_ROW_KEYS for r in data["care_staff_items"])
    linh, mai = data["care_staff_items"]
    assert (linh["full_name"], linh["care_count"]) == (LINH.full_name, 4)
    assert (mai["full_name"], mai["care_count"]) == (MAI.full_name, 1)
    assert "phone" not in linh


@pytest.mark.ac("AC-DASH-106")
def test_care_staff_ties_sorted_by_name(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    completed(db, people, "L-0", rating=5, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "M-0", rating=5, recorded_by="NV028", recorded_at=SEPT_10)
    names = [r["full_name"] for r in items(client_as(app, AN), "care.staff")["care_staff_items"]]
    assert names == sorted([LINH.full_name, MAI.full_name])


@pytest.mark.ac("AC-DASH-107")
def test_revision_orders_counted_per_order_company_wide(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    o50 = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2609-0050")
    o51 = insert_order(db, created_by=people["NV001"], status="REVISION", code="DH2609-0051")
    o70 = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2608-0070")
    db.execute(text("UPDATE orders SET total = 7500000 WHERE id = :id"), {"id": o50})
    revision(db, people, o50, 1, datetime(2026, 9, 5, 3, 0, tzinfo=UTC))
    revision(db, people, o50, 2, datetime(2026, 9, 20, 3, 0, tzinfo=UTC))
    revision(db, people, o51, 1, datetime(2026, 9, 15, 3, 0, tzinfo=UTC))
    revision(db, people, o70, 1, datetime(2026, 8, 28, 3, 0, tzinfo=UTC))

    data = items(client_as(app, HOA), "care.revision_orders")
    assert data["kind"] == "order"
    assert data["total"] == 2
    assert sorted(codes(data)) == ["DH2609-0050", "DH2609-0051"]
    row = next(r for r in data["order_items"] if r["order_code"] == "DH2609-0050")
    assert row["created_by_name"] == AN.full_name
    assert row["total"] == 7_500_000
    assert isinstance(row["total"], int)


@pytest.mark.ac("AC-DASH-108")
def test_feedback_cards_by_rating(db: Connection, app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for n in range(3):
        completed(db, people, f"S5-{n}", rating=5, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "S2", rating=2, recorded_by="NV023", recorded_at=SEPT_10)
    completed(db, people, "S-NONE")
    completed(db, people, "S5-AUG", rating=5, completed_at=AUG_29, recorded_by="NV023", recorded_at=AUG_29)

    linh = client_as(app, LINH)
    five, two, four = (items(linh, f"feedback.{n}") for n in (5, 2, 4))
    assert (five["total"], two["total"], four["total"]) == (3, 1, 0)
    assert sorted(codes(five)) == ["S5-0", "S5-1", "S5-2"]
    assert codes(two) == ["S2"]
    assert four["kind"] == "feedback"
    assert four["feedback_items"] == []
    assert all(set(r) == FEEDBACK_ROW_KEYS for r in five["feedback_items"])


@pytest.mark.ac("AC-DASH-109")
def test_top_customer_card_lists_completed_orders_this_month(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    minh_phat = customer(db, people, "KH0012", "Công ty TNHH Minh Phát")
    for code, total in (("DH2609-0061", 8_000_000), ("DH2609-0062", 6_500_000), ("DH2609-0063", 4_000_000)):
        completed(db, people, code, customer_id=minh_phat, total=total)
    completed(db, people, "DH2608-0060", customer_id=minh_phat, total=9_000_000, completed_at=AUG_29)
    running = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2609-0064")
    db.execute(text("UPDATE orders SET customer_id = :c WHERE id = :id"), {"c": minh_phat, "id": running})

    an = client_as(app, AN)
    data = items(an, f"top.{minh_phat}")
    assert data["kind"] == "order"
    assert data["label"] == "Công ty TNHH Minh Phát (KH0012)"
    assert data["total"] == 3
    assert sorted(codes(data)) == ["DH2609-0061", "DH2609-0062", "DH2609-0063"]
    revenue = sum(r["total"] for r in data["order_items"])
    assert revenue == 18_500_000
    top = an.get("/api/v1/dashboard").json()["top_customers"]
    assert next(r for r in top if r["customer_id"] == str(minh_phat))["total_revenue"] == revenue


@pytest.mark.ac("AC-DASH-110")
def test_top_card_bad_customer_is_404(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    problem(an.get("/api/v1/dashboard/cards/top.not-a-uuid/items"), 404, "NOT_FOUND")
    problem(an.get(f"/api/v1/dashboard/cards/top.{uuid.uuid4()}/items"), 404, "NOT_FOUND")
    problem(an.get(f"/api/v1/dashboard/cards/top.{uuid.uuid4()}/export"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-DASH-111")
def test_customer_care_never_sees_order_prices(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    minh_phat = customer(db, people, "KH0012", "Công ty TNHH Minh Phát")
    priced = completed(db, people, "DH2609-0071", customer_id=minh_phat, total=12_345_000)
    revision(db, people, priced, 1, SEPT_10)

    linh = client_as(app, LINH)
    for card in (f"top.{minh_phat}", "care.revision_orders"):
        data = items(linh, card)
        assert data["total"] == 1
        assert data["order_items"][0]["total"] is None
    table = csv_table(linh.get(f"/api/v1/dashboard/cards/top.{minh_phat}/export"))
    assert "Tổng tiền" not in table[0]
    assert all("12345000" not in cell for row in table for cell in row)


@pytest.mark.ac("AC-DASH-112")
def test_technician_and_anonymous_cannot_open_customer_cards(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID]
) -> None:
    minh_phat = customer(db, people, "KH0012", "Công ty TNHH Minh Phát")
    khoa = client_as(app, KHOA)
    for path in ("care.customers/items", "feedback.5/items", f"top.{minh_phat}/items", "care.staff/export"):
        problem(khoa.get(f"/api/v1/dashboard/cards/{path}"), 404, "NOT_FOUND")
    anonymous = TestClient(app, raise_server_exceptions=False)
    assert anonymous.get("/api/v1/dashboard/cards/care.customers/items").status_code == 401
    assert anonymous.get("/api/v1/dashboard/cards/feedback.5/export").status_code == 401


@pytest.mark.ac("AC-DASH-113")
def test_feedback_export_csv(
    db: Connection, app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]
) -> None:
    # 29/10 UTC nhưng đã là 30/10 giờ VN → tên file theo ngày VN; "tháng này" = 10/2026.
    clock.now = datetime(2026, 10, 29, 17, 45, tzinfo=UTC)
    oct_done = datetime(2026, 10, 20, 3, 0, tzinfo=UTC)
    completed(
        db, people, "DH2610-0041", rating=5, completed_at=oct_done, comment='=HYPERLINK("x")',
        recorded_by="NV023", recorded_at=datetime(2026, 10, 28, 7, 5, tzinfo=UTC),
    )  # fmt: skip
    completed(
        db, people, "DH2610-0043", rating=5, completed_at=oct_done,
        recorded_by="NV028", recorded_at=datetime(2026, 10, 27, 3, 0, tzinfo=UTC),
    )  # fmt: skip
    completed(db, people, "DH2610-0044", rating=4, completed_at=oct_done)

    res = client_as(app, AN).get("/api/v1/dashboard/cards/feedback.5/export")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        res.headers["content-disposition"] == 'attachment; filename="tong-quan-danh-gia-5-sao-2026-10-30.csv"'
    )
    table = csv_table(res)
    assert table[0] == [
        "Mã đơn",
        "Khách hàng",
        "SĐT",
        "Số sao",
        "Nhận xét",
        "Người ghi nhận",
        "Thời điểm ghi nhận",
        "Ngày hoàn tất",
    ]
    assert len(table) == 3
    first = next(r for r in table[1:] if r[0] == "DH2610-0041")
    assert first[3] == "5"
    assert first[4] == '\'=HYPERLINK("x")'
    assert first[5] == LINH.full_name
    assert first[6] == "28/10/2026 14:05"
    assert first[7] == "20/10/2026 10:00"


@pytest.mark.ac("AC-DASH-114")
def test_care_staff_and_top_export_csv(
    db: Connection, app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 10, 29, 17, 45, tzinfo=UTC)
    oct_done = datetime(2026, 10, 20, 3, 0, tzinfo=UTC)
    minh_phat = customer(db, people, "KH0012", "Công ty TNHH Minh Phát")
    completed(
        db, people, "DH2610-0081", customer_id=minh_phat, completed_at=oct_done, rating=5,
        recorded_by="NV023", recorded_at=datetime(2026, 10, 28, 7, 5, tzinfo=UTC),
    )  # fmt: skip

    tuan = client_as(app, TUAN)
    staff_res = tuan.get("/api/v1/dashboard/cards/care.staff/export")
    assert staff_res.status_code == 200, staff_res.text
    assert (
        staff_res.headers["content-disposition"]
        == 'attachment; filename="tong-quan-cskh-nv-goi-dien-2026-10-30.csv"'
    )
    staff = csv_table(staff_res)
    assert staff[0] == ["Mã NV", "Họ tên", "Số KH đã chăm sóc", "Lần ghi gần nhất"]
    assert staff[1] == [LINH.code, LINH.full_name, "1", "28/10/2026 14:05"]

    top_res = tuan.get(f"/api/v1/dashboard/cards/top.{minh_phat}/export")
    assert top_res.status_code == 200, top_res.text
    assert (
        top_res.headers["content-disposition"]
        == 'attachment; filename="tong-quan-top-kh-kh0012-2026-10-30.csv"'
    )
    top = csv_table(top_res)
    assert top[0] == ["Mã đơn", "Khách hàng", "SĐT", "Người tạo", "Ngày tạo", "Tổng tiền"]
    assert [r[0] for r in top[1:]] == ["DH2610-0081"]


@pytest.mark.ac("AC-DASH-115")
def test_page_size_limit_and_export_too_large(
    db: Connection, app: FastAPI, people: dict[str, uuid.UUID], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.dashboard import cards

    an = client_as(app, AN)
    assert (
        an.get("/api/v1/dashboard/cards/care.customers/items", params={"page_size": 101}).status_code == 422
    )
    assert cards.EXPORT_MAX_ROWS == 5000
    monkeypatch.setattr(cards, "EXPORT_MAX_ROWS", 2)
    for n in range(3):
        completed(db, people, f"X-{n}", rating=5, recorded_by="NV023", recorded_at=SEPT_10)
    body = problem(an.get("/api/v1/dashboard/cards/care.customers/export"), 409, "EXPORT_TOO_LARGE")
    assert body["detail"] == "Quá nhiều dòng để xuất (tối đa 2)."
    assert items(an, "care.customers")["total"] == 3
