"""M20-08: `GET /api/v1/employees/export` (AC-EMP-108…115) and username search (AC-EMP-107)."""

import csv
import io
import uuid
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection
from sqlalchemy import update as sql_update

from app.core.authz import declared_routes
from app.modules.identity.models import Employee
from tests.integration.conftest import AN, KHOA, FakeClock, Person, seed
from tests.integration.test_customers_api import client_as, problem

URL = "/api/v1/employees/export"
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Nguyễn Minh Tuấn", "TECHNICAL")
MAI = Person("mai.cskh@smyou.vn", "Mai@SmYou26", ("CUSTOMER_CARE",), "NV016", "Đỗ Thị Mai", "SALES")
CHAU = Person("chau.tm@smyou.vn", "Chau@SmYou26", ("SALE",), "NV011", "Trần Minh Châu", "SALES")
KHOA_PV = Person(
    "khoa.pv@smyou.vn",
    "Khoa@SmYou26",
    ("TECHNICIAN", "TECH_LEAD"),
    "NV0007",
    "Phạm Văn Khoa",
    "ECONOMIC",
    "khoapv",
)
HOA_LT = Person("hoa.lt@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV0008", "Lê Thị Hoa", "ECONOMIC")
HEADER = [
    "Mã NV",
    "Họ tên",
    "Tài khoản đăng nhập",
    "Email",
    "Số điện thoại",
    "Ngày sinh",
    "Nơi sinh",
    "Giới tính",
    "Địa chỉ",
    "Số CMND/CCCD",
    "Ngày cấp",
    "Nơi cấp",
    "Tình trạng hôn nhân",
    "Phòng ban",
    "Chức danh",
    "Vai trò",
    "Trạng thái",
    "Ngày tạo",
]


def profile(db: Connection, employee_id: uuid.UUID, **fields: object) -> None:
    db.execute(sql_update(Employee).where(Employee.id == employee_id).values(**fields))


def parse(body: bytes) -> list[list[str]]:
    content = body.decode("utf-8")
    assert content.startswith("﻿")
    return list(csv.reader(io.StringIO(content[1:])))


def full_khoa(db: Connection) -> uuid.UUID:
    khoa_id = seed(db, KHOA_PV)
    profile(
        db,
        khoa_id,
        phone="0912345678",
        birth_date=date(1995, 4, 20),
        birth_place="Đà Nẵng",
        gender="MALE",
        address="12 Lê Lợi, Hải Châu",
        id_number="048095001234",
        id_issued_date=date(2021, 6, 15),
        id_issued_place="Cục Cảnh sát QLHC về TTXH",
        marital_status="MARRIED",
        title="Kỹ thuật viên",
        created_at=datetime(2026, 10, 31, 17, 30, tzinfo=UTC),
    )
    return khoa_id


@pytest.mark.ac("AC-EMP-107")
def test_search_matches_username(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    khoa_id = full_khoa(db)
    seed(db, HOA)
    an = client_as(app, AN)

    def codes(q: str) -> list[str]:
        res = an.get("/api/v1/employees", params={"q": q})
        assert res.status_code == 200, res.text
        return [e["code"] for e in res.json()["items"]]

    assert codes("khoapv") == ["NV0007"]
    assert an.get(f"/api/v1/employees/{khoa_id}").json()["username"] == "khoapv"
    # old matches still work: unaccented name, code, email, phone
    assert codes("pham van khoa") == ["NV0007"]
    assert codes("NV0007") == ["NV0007"]
    assert codes("khoa.pv@smyou") == ["NV0007"]
    assert codes("0912345678") == ["NV0007"]
    assert codes("le thi hoa") == ["NV005"]


@pytest.mark.ac("AC-EMP-108")
def test_export_every_matching_employee_ordered_by_code(
    app: FastAPI, db: Connection, clock: FakeClock
) -> None:
    clock.now = datetime(2026, 10, 31, 18, 0, tzinfo=UTC)  # 01/11/2026 01:00 giờ VN
    seed(db, AN)  # NV001
    full_khoa(db)  # NV0007
    seed(db, HOA_LT)  # NV0008
    for n in (2, 3, 4, 5, 6, *range(9, 27)):
        seed(
            db,
            Person(f"nv{n}@smyou.vn", "Pass@SmYou26", ("SALE",), f"NV{n:04d}", f"Nhân viên {n}", "ECONOMIC"),
        )

    res = client_as(app, AN).get(URL)

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert res.content.startswith(b"\xef\xbb\xbf")
    assert res.headers["content-disposition"] == 'attachment; filename="nhan-vien-2026-11-01.csv"'
    header, *rows = parse(res.content)
    assert header == HEADER
    assert len(rows) == 26  # 25 + An: more than one page of 20, no paging
    codes = [r[0] for r in rows]
    assert codes == ["NV001", *[f"NV{n:04d}" for n in range(2, 27)]]
    assert codes.index("NV0002") < codes.index("NV0010")


@pytest.mark.ac("AC-EMP-109")
def test_export_full_and_minimal_profile(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    full_khoa(db)
    hoa_id = seed(db, HOA_LT, is_active=False)
    profile(db, hoa_id, email=None)

    _, *rows = parse(client_as(app, AN).get(URL, params={"q": "NV000"}).content)
    by_code = {r[0]: dict(zip(HEADER, r, strict=True)) for r in rows}

    khoa = by_code["NV0007"]
    assert khoa["Tài khoản đăng nhập"] == "khoapv"
    assert khoa["Ngày sinh"] == "20/04/1995"
    assert khoa["Giới tính"] == "Nam"
    assert khoa["Ngày cấp"] == "15/06/2021"
    assert khoa["Tình trạng hôn nhân"] == "Đã kết hôn"
    assert khoa["Phòng ban"] == "Phát Triển Kinh Tế"
    assert khoa["Chức danh"] == "Kỹ thuật viên"
    assert khoa["Vai trò"] == "Quản lý kỹ thuật, Nhân viên kỹ thuật"
    assert khoa["Trạng thái"] == "Đang hoạt động"
    assert khoa["Ngày tạo"] == "01/11/2026 00:30"
    assert khoa["Số điện thoại"] == '="0912345678"'
    assert khoa["Số CMND/CCCD"] == '="048095001234"'

    hoa = by_code["NV0008"]
    assert hoa["Email"] == ""
    for field in ("Số điện thoại", "Ngày sinh", "Nơi sinh", "Giới tính", "Địa chỉ", "Số CMND/CCCD"):
        assert hoa[field] == "", field
    assert hoa["Trạng thái"] == "Đã khoá"


@pytest.mark.ac("AC-EMP-111")
def test_export_uses_list_search_and_filters(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    seed(db, TUAN)
    seed(db, CHAU, is_active=False)
    seed(db, HOA)
    an = client_as(app, AN)

    def names(params: dict[str, str]) -> list[str]:
        res = an.get(URL, params=params)
        assert res.status_code == 200, res.text
        return [r[1] for r in parse(res.content)[1:]]

    assert names({"q": "minh"}) == ["Nguyễn Minh Tuấn", "Trần Minh Châu"]
    assert names({"role": "SALE", "is_active": "true"}) == ["Lê Thị Hoa"]
    # same rows (and order) as the paged list for the same filters
    listed = an.get("/api/v1/employees", params={"q": "minh"}).json()["items"]
    assert [e["full_name"] for e in listed] == names({"q": "minh"})


@pytest.mark.ac("AC-EMP-112")
@pytest.mark.parametrize("person", [TUAN, HOA, MAI, KHOA], ids=lambda p: p.roles[0])
def test_export_forbidden_without_employee_manage(app: FastAPI, db: Connection, person: Person) -> None:
    seed(db, person)
    problem(client_as(app, person).get(URL), 403, "FORBIDDEN")


@pytest.mark.ac("AC-EMP-112")
def test_export_route_declares_employee_manage(app: FastAPI) -> None:
    assert ("GET", URL, "employee.manage") in declared_routes(app)


@pytest.mark.ac("AC-EMP-113")
def test_export_requires_login(app: FastAPI) -> None:
    assert TestClient(app).get(URL).status_code == 401


@pytest.mark.ac("AC-EMP-114")
@pytest.mark.parametrize("params", [{"q": "x" * 101}, {"role": "FOO"}, {"is_active": "abc"}])
def test_export_rejects_invalid_params(app: FastAPI, db: Connection, params: dict[str, str]) -> None:
    seed(db, AN)
    problem(client_as(app, AN).get(URL, params=params), 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-EMP-114")
def test_export_accepts_query_at_max_length(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    assert client_as(app, AN).get(URL, params={"q": "x" * 100}).status_code == 200


@pytest.mark.ac("AC-EMP-115")
def test_export_no_match_is_header_only(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    res = client_as(app, AN).get(URL, params={"q": "zzzz"})
    assert res.status_code == 200, res.text
    assert parse(res.content) == [HEADER]
