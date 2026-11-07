"""M20-05: `GET /api/v1/customers/export` — CSV of every matching customer (AC-CUS-027…036)."""

import csv
import io
import uuid
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection
from sqlalchemy import insert as sql_insert

from app.modules.customers.models import Customer
from tests.integration.conftest import AN, KHOA, FakeClock, Person, seed
from tests.integration.test_customers_api import HOA, TUAN, client_as, problem

MAI = Person("mai.cskh@smyou.vn", "Mai@SmYou26", ("CUSTOMER_CARE",), "NV016", "Đỗ Thị Mai", "SALES")
URL = "/api/v1/customers/export"
HEADER = [
    "Mã KH",
    "Loại",
    "Tên khách hàng",
    "Số điện thoại",
    "Email",
    "Mã số thuế",
    "Địa chỉ",
    "Người liên hệ",
    "SĐT người liên hệ",
    "Ngày thành lập",
    "Giám đốc",
    "SĐT giám đốc",
    "Phụ trách IT",
    "SĐT phụ trách IT",
    "Ngày sinh",
    "Giới tính",
    "Nghề nghiệp",
    "Ghi chú",
    "Người tạo",
    "Ngày tạo",
]


def insert(db: Connection, *, code: str, created_by: uuid.UUID, **fields: object) -> None:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "code": code,
        "type": "INDIVIDUAL",
        "name": f"Khách {code}",
        "phone": "0900000000",
        "created_by": created_by,
        **fields,
    }
    db.execute(sql_insert(Customer).values(**values))


def parse(body: bytes) -> list[list[str]]:
    content = body.decode("utf-8")
    assert content.startswith("﻿")
    return list(csv.reader(io.StringIO(content[1:])))


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, MAI, TUAN, KHOA)}


@pytest.mark.ac("AC-CUS-027")
@pytest.mark.ac("AC-CUS-028")
def test_export_all_customers_with_full_fields(
    app: FastAPI, db: Connection, clock: FakeClock, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 10, 31, 18, 0, tzinfo=UTC)  # 01/11/2026 01:00 giờ VN
    insert(
        db,
        code="KH00001",
        created_by=people["NV005"],
        type="COMPANY",
        name="Công ty TNHH Minh Phát",
        phone="0281234567",
        email="ketoan@minhphat.vn",
        tax_code="0312345678",
        address="12 Lê Lợi",
        contact_person="Chị Mai",
        contact_person_phone="0912345678",
        founded_date=date(2015, 3, 12),
        director_name="Nguyễn Văn Phát",
        director_phone="0987654321",
        it_contact_name="Anh Tú",
        it_contact_phone="0933333333",
        note="Khách quen",
        created_at=datetime(2026, 10, 31, 17, 30, tzinfo=UTC),
    )
    insert(
        db,
        code="KH00002",
        created_by=people["NV001"],
        name="Trần Thị Lan",
        phone="0901234567",
        email=None,
        address="5 Hai Bà Trưng",
        date_of_birth=date(1990, 7, 5),
        gender="FEMALE",
        occupation="Kế toán",
    )
    for n in range(25, 2, -1):  # chèn ngược để chứng minh sắp theo mã
        insert(db, code=f"KH{n:05d}", created_by=people["NV001"])

    res = client_as(app, AN).get(URL)

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert res.headers["content-disposition"] == 'attachment; filename="khach-hang-2026-11-01.csv"'
    rows = parse(res.content)
    assert rows[0] == HEADER
    data = [dict(zip(HEADER, row, strict=True)) for row in rows[1:]]
    assert len(data) == 25
    assert [r["Mã KH"] for r in data] == [f"KH{n:05d}" for n in range(1, 26)]

    company, person = data[0], data[1]
    assert company["Loại"] == "Công ty"
    assert company["Tên khách hàng"] == "Công ty TNHH Minh Phát"
    assert company["Ngày thành lập"] == "12/03/2015"
    assert company["Giám đốc"] == "Nguyễn Văn Phát"
    assert company["Phụ trách IT"] == "Anh Tú"
    assert company["Ngày sinh"] == company["Giới tính"] == company["Nghề nghiệp"] == ""
    assert company["Người tạo"] == "Lê Thị Hoa"
    assert company["Ngày tạo"] == "01/11/2026 00:30"
    assert person["Loại"] == "Cá nhân"
    assert person["Ngày sinh"] == "05/07/1990"
    assert person["Giới tính"] == "Nữ"
    assert person["Nghề nghiệp"] == "Kế toán"
    assert person["Email"] == ""
    assert person["Ngày thành lập"] == person["Giám đốc"] == person["Người liên hệ"] == ""
    assert person["Người tạo"] == "Nguyễn Văn An"


@pytest.mark.ac("AC-CUS-029")
def test_export_uses_list_search_and_type_filter(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    creator = people["NV001"]
    insert(db, code="KH00001", created_by=creator, type="COMPANY", name="Công ty TNHH Minh Phát")
    insert(db, code="KH00002", created_by=creator, name="Nguyễn Minh Tuấn")
    insert(db, code="KH00003", created_by=creator, name="Trần Thị Lan")
    an = client_as(app, AN)

    def names(**params: str) -> list[str]:
        res = an.get(URL, params=params)
        assert res.status_code == 200, res.text
        return [row[2] for row in parse(res.content)[1:]]

    assert names(q="minh") == ["Công ty TNHH Minh Phát", "Nguyễn Minh Tuấn"]
    assert names(q="minh", type="INDIVIDUAL") == ["Nguyễn Minh Tuấn"]


@pytest.mark.ac("AC-CUS-032")
def test_sale_and_customer_care_export_every_customer(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for n in range(1, 4):
        insert(db, code=f"KH{n:05d}", created_by=people["NV001"])
    insert(db, code="KH00004", created_by=people["NV005"])

    for person in (HOA, MAI):
        res = client_as(app, person).get(URL)
        assert res.status_code == 200, res.text
        assert len(parse(res.content)) == 1 + 4


@pytest.mark.ac("AC-CUS-033")
def test_tech_lead_and_technician_forbidden(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for person in (TUAN, KHOA):
        problem(client_as(app, person).get(URL), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CUS-034")
def test_anonymous_unauthorized(api: TestClient) -> None:
    res = api.get(URL)
    assert res.status_code == 401, res.text


@pytest.mark.ac("AC-CUS-035")
def test_invalid_params_rejected(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    problem(an.get(URL, params={"q": "x" * 101}), 422, "VALIDATION_ERROR")
    problem(an.get(URL, params={"type": "FOO"}), 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-CUS-036")
def test_no_match_yields_header_only(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    insert(db, code="KH00001", created_by=people["NV001"], name="Trần Thị Lan")

    res = client_as(app, AN).get(URL, params={"q": "zzzz"})

    assert res.status_code == 200, res.text
    assert parse(res.content) == [HEADER]
