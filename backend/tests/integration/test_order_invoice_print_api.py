"""M17-04: GET /orders/{id}/invoice-print — company info + issuer + slip number (AC-ORD-202…206, 217, 218)."""

import base64
import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, FakeClock, Person, login, seed
from tests.integration.test_orders_confirmation_api import insert_order, insert_task_assignment

THUY = Person("thuy.nguyen@smyou.vn", "Thuy@SmYou26", ("SALE",), "NV005", "Nguyễn Thị Thu Thủy", "SALES")
CHI = Person("chi.pham@smyou.vn", "Chi@SmYou26", ("CUSTOMER_CARE",), "NV015", "Phạm Thị Chi", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quang Tuấn", "TECHNICAL")
LONG = Person("long.dang@smyou.vn", "Long@SmYou26", ("TECHNICIAN",), "NV016", "Đặng Văn Long", "TECHNICAL")

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200 + b"L"


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res, status: int, code: str) -> dict:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    return body


def url(order_id: uuid.UUID) -> str:
    return f"/api/v1/orders/{order_id}/invoice-print"


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, THUY, CHI, TUAN, KHOA, LONG)}


def order_at(
    db: Connection, *, created_by: uuid.UUID, created_at: datetime, code: str, status: str = "IN_PROGRESS"
) -> uuid.UUID:
    order_id = insert_order(db, created_by=created_by, status=status, code=code)
    db.execute(text("UPDATE orders SET created_at = :at WHERE id = :id"), {"at": created_at, "id": order_id})
    return order_id


@pytest.mark.ac("AC-ORD-202")
def test_sale_gets_company_issuer_and_slip(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    clock.now = datetime(2026, 9, 24, 3, 0, tzinfo=UTC)
    order_id = order_at(
        db, created_by=people["NV005"], created_at=datetime(2026, 9, 24, 2, 0, tzinfo=UTC), code="DH2609-0012"
    )

    res = client_as(app, THUY).get(url(order_id))

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["company"] == {
        "name": "CÔNG TY TNHH SMYOU",
        "tax_code": "0309390732",
        "address": "8C/A-9C/A Nguyễn Ảnh Thủ, Khu Phố 1, P. Trung Mỹ Tây, TP.HCM",
        "phone": "0932068787",
        "fax": "02862533978",
        "email": "kimyensmyou@gmail.com",
        "website": "http://smyou.vn",
        "logo_url": None,
    }
    assert body["issuer_name"] == "Nguyễn Thị Thu Thủy"
    assert body["slip_no"] == "01-XBH24092026"
    assert datetime.fromisoformat(body["printed_at"]) == clock.now


@pytest.mark.ac("AC-ORD-202")
def test_issuer_is_the_caller_not_the_order_creator(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-0013")

    res = client_as(app, AN).get(url(order_id))

    assert res.status_code == 200, res.text
    assert res.json()["issuer_name"] == "Nguyễn Văn An"


@pytest.mark.ac("AC-ORD-202")
@pytest.mark.ac("AC-ORD-203")
def test_logo_is_inlined_for_every_printer(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    """Sale/CSKH/technicians can't open the logo attachment itself (AC-SYS-132), so the print data
    carries it inline as a data URL."""
    an = client_as(app, AN)
    uploaded = an.post(
        "/api/v1/company-profile/logo",
        params={"version": 1},
        files={"file": ("logo.png", PNG, "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-0014")
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])

    for person in (THUY, CHI, TUAN, KHOA):
        res = client_as(app, person).get(url(order_id))
        assert res.status_code == 200, (person.code, res.text)
        logo_url = res.json()["company"]["logo_url"]
        prefix = "data:image/png;base64,"
        assert logo_url.startswith(prefix), person.code
        assert base64.b64decode(logo_url.removeprefix(prefix)) == PNG


@pytest.mark.ac("AC-ORD-203")
@pytest.mark.parametrize("person", [AN, TUAN, CHI, KHOA], ids=lambda p: p.roles[0])
def test_order_readers_can_print(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], person: Person
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-0015")
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])

    res = client_as(app, person).get(url(order_id))

    assert res.status_code == 200, res.text
    assert res.json()["issuer_name"] == person.full_name


@pytest.mark.ac("AC-ORD-203")
@pytest.mark.parametrize(
    "status", ["DRAFT", "PENDING_DISPATCH", "AWAITING_CONFIRMATION", "COMPLETED", "REVISION"]
)
def test_every_status_but_cancelled_is_printable(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], status: str
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status=status, code="DH2609-0016")

    assert client_as(app, THUY).get(url(order_id)).status_code == 200


@pytest.mark.ac("AC-ORD-204")
def test_unassigned_technician_gets_404(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-0017")
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])

    problem(client_as(app, LONG).get(url(order_id)), 404, "NOT_FOUND")


@pytest.mark.ac("AC-ORD-205")
def test_missing_order_is_404(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    problem(client_as(app, THUY).get(url(uuid.uuid4())), 404, "NOT_FOUND")


@pytest.mark.ac("AC-ORD-206")
def test_cancelled_order_is_409(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="CANCELLED", code="DH2609-0018")

    problem(client_as(app, THUY).get(url(order_id)), 409, "INVALID_STATE")


def _day_of_orders(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    """23 orders created earlier on 24/09/2026 (VN) — one cancelled, two sharing a timestamp — plus
    orders on 23/09 and 25/09 just across the VN-midnight boundaries; returns the 24th of the day."""
    creator = people["NV005"]
    # 23/09 23:59 VN and 25/09 00:00 VN — must not count.
    order_at(db, created_by=creator, created_at=datetime(2026, 9, 23, 16, 59, tzinfo=UTC), code="DH2609-0001")
    order_at(db, created_by=creator, created_at=datetime(2026, 9, 24, 17, 0, tzinfo=UTC), code="DH2609-0099")
    # 24/09 00:00 VN is the first second of the day.
    for n in range(23):
        order_at(
            db,
            created_by=creator,
            created_at=datetime(2026, 9, 23, 17, n, tzinfo=UTC),
            code=f"DH2609-{n + 2:04d}",
            status="CANCELLED" if n == 5 else "IN_PROGRESS",
        )
    # Same instant as the 23rd one → ordered after it by code.
    return order_at(
        db, created_by=creator, created_at=datetime(2026, 9, 23, 17, 22, tzinfo=UTC), code="DH2609-0030"
    )


@pytest.mark.ac("AC-ORD-217")
def test_slip_no_is_rank_within_creation_day_and_stable(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    order_id = _day_of_orders(db, people)
    clock.now = datetime(2026, 9, 24, 8, 0, tzinfo=UTC)
    thuy = client_as(app, THUY)

    first = thuy.get(url(order_id))
    again = thuy.get(url(order_id))

    assert first.status_code == 200, first.text
    assert first.json()["slip_no"] == "24-XBH24092026"
    assert again.json()["slip_no"] == "24-XBH24092026"


@pytest.mark.ac("AC-ORD-217")
def test_first_order_of_the_day_is_01(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    _day_of_orders(db, people)
    clock.now = datetime(2026, 9, 24, 8, 0, tzinfo=UTC)
    first_of_day = db.execute(text("SELECT id FROM orders WHERE code = 'DH2609-0002'")).scalar_one()

    res = client_as(app, THUY).get(url(first_of_day))

    assert res.json()["slip_no"] == "01-XBH24092026"


@pytest.mark.ac("AC-ORD-217")
def test_slip_no_uses_vietnam_day_at_utc_boundary(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    _day_of_orders(db, people)
    # 24/09 23:30 UTC is already 25/09 06:30 in Vietnam.
    clock.now = datetime(2026, 9, 24, 23, 30, tzinfo=UTC)
    next_day = db.execute(text("SELECT id FROM orders WHERE code = 'DH2609-0099'")).scalar_one()

    res = client_as(app, THUY).get(url(next_day))

    assert res.json()["slip_no"] == "01-XBH25092026"


@pytest.mark.ac("AC-ORD-218")
def test_slip_date_part_is_print_day(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    order_id = _day_of_orders(db, people)
    clock.now = datetime(2026, 9, 25, 2, 0, tzinfo=UTC)

    res = client_as(app, THUY).get(url(order_id))

    assert res.json()["slip_no"] == "24-XBH25092026"
