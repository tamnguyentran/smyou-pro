"""M20-08: CSV builder for `GET /employees/export` (AC-EMP-109, 110)."""

import csv
import io
import uuid
from datetime import UTC, date, datetime

import pytest

from app.modules.departments.models import Department
from app.modules.employees.export import CSV_HEADER, build_csv
from app.modules.identity.models import Employee, EmployeeRole

ROLE_LABELS = {
    "MANAGER": "Quản lý chung",
    "SALE": "Nhân viên kinh doanh",
    "CUSTOMER_CARE": "Chăm sóc khách hàng",
    "TECH_LEAD": "Quản lý kỹ thuật",
    "TECHNICIAN": "Nhân viên kỹ thuật",
}
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


def _employee(*roles: str, **overrides: object) -> Employee:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "code": "NV0008",
        "full_name": "Lê Thị Hoa",
        "username": "hoalt",
        "email": None,
        "password_hash": "$argon2id$secret-hash",
        "is_active": True,
        "created_at": datetime(2026, 10, 1, 3, 0, tzinfo=UTC),
        "department": Department(name="Phát Triển Kinh Tế"),
        "roles": [EmployeeRole(role=r) for r in roles or ("SALE",)],
    }
    return Employee(**(fields | overrides))


def _rows(csv_bytes: bytes) -> list[dict[str, str]]:
    text = csv_bytes.decode("utf-8")
    assert text.startswith("﻿")
    reader = csv.reader(io.StringIO(text[1:]))
    header = next(reader)
    assert header == HEADER
    return [dict(zip(header, row, strict=True)) for row in reader]


@pytest.mark.ac("AC-EMP-109")
def test_full_and_minimal_rows_formatted() -> None:
    khoa = _employee(
        "TECHNICIAN",
        "TECH_LEAD",
        code="NV0007",
        full_name="Phạm Văn Khoa",
        username="khoapv",
        email="khoa.pv@smyou.vn",
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
    hoa = _employee(is_active=False)

    full, minimal = _rows(build_csv([khoa, hoa], ROLE_LABELS))

    assert CSV_HEADER == HEADER
    assert full == {
        "Mã NV": "NV0007",
        "Họ tên": "Phạm Văn Khoa",
        "Tài khoản đăng nhập": "khoapv",
        "Email": "khoa.pv@smyou.vn",
        "Số điện thoại": '="0912345678"',
        "Ngày sinh": "20/04/1995",
        "Nơi sinh": "Đà Nẵng",
        "Giới tính": "Nam",
        "Địa chỉ": "12 Lê Lợi, Hải Châu",
        "Số CMND/CCCD": '="048095001234"',
        "Ngày cấp": "15/06/2021",
        "Nơi cấp": "Cục Cảnh sát QLHC về TTXH",
        "Tình trạng hôn nhân": "Đã kết hôn",
        "Phòng ban": "Phát Triển Kinh Tế",
        "Chức danh": "Kỹ thuật viên",
        # roles in the fixed ROLES order, whatever order they were granted in
        "Vai trò": "Quản lý kỹ thuật, Nhân viên kỹ thuật",
        "Trạng thái": "Đang hoạt động",
        "Ngày tạo": "01/11/2026 00:30",
    }
    blank = {"Email", "Số điện thoại", "Ngày sinh", "Nơi sinh", "Giới tính", "Địa chỉ"}
    blank |= {"Số CMND/CCCD", "Ngày cấp", "Nơi cấp", "Tình trạng hôn nhân", "Chức danh"}
    assert {k for k, v in minimal.items() if v == ""} == blank
    assert minimal["Trạng thái"] == "Đã khoá"
    assert minimal["Vai trò"] == "Nhân viên kinh doanh"


@pytest.mark.ac("AC-EMP-109")
@pytest.mark.parametrize(
    ("gender", "marital", "gender_label", "marital_label"),
    [
        ("FEMALE", "SINGLE", "Nữ", "Độc thân"),
        ("OTHER", "DIVORCED", "Khác", "Ly hôn"),
        ("MALE", "WIDOWED", "Nam", "Goá"),
    ],
)
def test_gender_and_marital_labels(gender: str, marital: str, gender_label: str, marital_label: str) -> None:
    (row,) = _rows(build_csv([_employee(gender=gender, marital_status=marital)], ROLE_LABELS))
    assert (row["Giới tính"], row["Tình trạng hôn nhân"]) == (gender_label, marital_label)


@pytest.mark.ac("AC-EMP-110")
def test_leading_zeros_kept_and_formula_injection_escaped() -> None:
    numbers = _employee(phone="0912345678", id_number="048095001234")
    risky = _employee(
        code="NV0009",
        address='=HYPERLINK("http://x")',
        title="+Trưởng nhóm",
        birth_place="@cmd",
        id_issued_place="-1+1",
    )

    csv_bytes = build_csv([numbers, risky], ROLE_LABELS)
    first, second = _rows(csv_bytes)

    assert first["Số điện thoại"] == '="0912345678"'
    assert first["Số CMND/CCCD"] == '="048095001234"'
    assert second["Số điện thoại"] == ""
    assert second["Số CMND/CCCD"] == ""
    assert second["Địa chỉ"] == '\'=HYPERLINK("http://x")'
    assert second["Chức danh"] == "'+Trưởng nhóm"
    assert second["Nơi sinh"] == "'@cmd"
    assert second["Nơi cấp"] == "'-1+1"
    text = csv_bytes.decode("utf-8")
    assert "argon2" not in text
    assert not any("mật khẩu" in h.lower() for h in CSV_HEADER)
