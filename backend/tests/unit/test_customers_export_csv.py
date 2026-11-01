"""M20-05: CSV builder for `GET /customers/export` (AC-CUS-028, 030, 031)."""

import csv
import io
import uuid
from datetime import UTC, date, datetime

import pytest

from app.modules.customers.export import CSV_HEADER, build_csv
from app.modules.customers.models import Customer


def _customer(**overrides: object) -> Customer:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "code": "KH0009",
        "type": "INDIVIDUAL",
        "name": "Trần Thị Lan",
        "phone": "0901234567",
        "created_by": uuid.uuid4(),
        "created_at": datetime(2026, 10, 1, 3, 0, tzinfo=UTC),
    }
    return Customer(**(fields | overrides))


def _rows(csv_bytes: bytes) -> list[dict[str, str]]:
    text = csv_bytes.decode("utf-8")
    assert text.startswith("﻿")
    reader = csv.reader(io.StringIO(text[1:]))
    header = next(reader)
    assert header == CSV_HEADER
    return [dict(zip(header, row, strict=True)) for row in reader]


@pytest.mark.ac("AC-CUS-028")
def test_company_and_individual_rows_formatted() -> None:
    company = _customer(
        code="KH0001",
        type="COMPANY",
        name="Công ty TNHH Minh Phát",
        founded_date=date(2015, 3, 12),
        director_name="Nguyễn Văn Phát",
        created_at=datetime(2026, 10, 31, 17, 30, tzinfo=UTC),
    )
    person = _customer(
        code="KH0002",
        date_of_birth=date(1990, 7, 5),
        gender="FEMALE",
        occupation="Kế toán",
        email=None,
    )

    first, second = _rows(build_csv([(company, "Lê Thị Hoa"), (person, "Nguyễn Văn An")]))

    assert first["Loại"] == "Công ty"
    assert first["Ngày thành lập"] == "12/03/2015"
    assert first["Giám đốc"] == "Nguyễn Văn Phát"
    assert first["Ngày sinh"] == first["Giới tính"] == first["Nghề nghiệp"] == ""
    assert first["Người tạo"] == "Lê Thị Hoa"
    assert first["Ngày tạo"] == "01/11/2026 00:30"

    assert second["Loại"] == "Cá nhân"
    assert second["Ngày sinh"] == "05/07/1990"
    assert second["Giới tính"] == "Nữ"
    assert second["Nghề nghiệp"] == "Kế toán"
    assert second["Email"] == ""
    assert second["Ngày thành lập"] == second["Giám đốc"] == second["Người liên hệ"] == ""


@pytest.mark.ac("AC-CUS-028")
@pytest.mark.parametrize(("gender", "label"), [("MALE", "Nam"), ("FEMALE", "Nữ"), ("OTHER", "Khác")])
def test_gender_labels(gender: str, label: str) -> None:
    (row,) = _rows(build_csv([(_customer(gender=gender), "An")]))
    assert row["Giới tính"] == label


@pytest.mark.ac("AC-CUS-030")
def test_formula_cells_escaped_and_multiline_note_kept_in_one_cell() -> None:
    attacker = _customer(
        code="KH0003",
        name='=HYPERLINK("http://x")',
        note="+84 gọi lại",
        address="-Lô 5 KCN",
        occupation="@admin",
    )
    plain = _customer(code="KH0004", note="Dòng 1\nDòng 2")

    first, second = _rows(build_csv([(attacker, "An"), (plain, "An")]))

    assert first["Tên khách hàng"] == '\'=HYPERLINK("http://x")'
    assert first["Ghi chú"] == "'+84 gọi lại"
    assert first["Địa chỉ"] == "'-Lô 5 KCN"
    assert first["Nghề nghiệp"] == "'@admin"
    assert second["Tên khách hàng"] == "Trần Thị Lan"
    assert second["Ghi chú"] == "Dòng 1\nDòng 2"


@pytest.mark.ac("AC-CUS-031")
def test_phone_and_tax_code_keep_leading_zero_in_excel() -> None:
    company = _customer(
        type="COMPANY",
        phone="0901234567",
        tax_code="0312345678",
        director_phone="0987654321",
    )

    (row,) = _rows(build_csv([(company, "An")]))

    assert row["Số điện thoại"] == '="0901234567"'
    assert row["Mã số thuế"] == '="0312345678"'
    assert row["SĐT giám đốc"] == '="0987654321"'
    assert row["SĐT người liên hệ"] == ""
    assert row["SĐT phụ trách IT"] == ""
