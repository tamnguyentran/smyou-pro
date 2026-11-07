"""CSV for `GET /api/v1/customers/export` (M20-05): every field of each customer; cell rules in
`app/core/csv_export.py`."""

from collections.abc import Iterable

from app.core.csv_export import GENDER_LABELS, day, moment, number_text, text, to_bytes
from app.modules.customers.models import Customer

CSV_HEADER = [
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
_TYPE_LABELS = {"COMPANY": "Công ty", "INDIVIDUAL": "Cá nhân"}


def build_csv(rows: Iterable[tuple[Customer, str | None]]) -> bytes:
    """`rows` = (customer, creator's full name), already ordered."""
    return to_bytes(
        CSV_HEADER,
        (
            [
                text(c.code),
                _TYPE_LABELS.get(c.type, c.type),
                text(c.name),
                number_text(c.phone),
                text(c.email),
                number_text(c.tax_code),
                text(c.address),
                text(c.contact_person),
                number_text(c.contact_person_phone),
                day(c.founded_date),
                text(c.director_name),
                number_text(c.director_phone),
                text(c.it_contact_name),
                number_text(c.it_contact_phone),
                day(c.date_of_birth),
                GENDER_LABELS.get(c.gender, c.gender) if c.gender else "",
                text(c.occupation),
                text(c.note),
                text(creator_name),
                moment(c.created_at),
            ]
            for c, creator_name in rows
        ),
    )
