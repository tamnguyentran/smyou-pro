"""Pure company-profile rules (M17-01). No framework imports."""

import re
import uuid

from app.modules.employees.domain import normalize_phone

# Singleton row: attachments.owner_id and audit_events.entity_id need a uuid, the table's pk is 1.
COMPANY_PROFILE_ID = uuid.UUID(int=1)

# Unlike customers (^0\d{9}$): HCMC landlines are 11 digits (028…).
PHONE = re.compile(r"0\d{9,10}")
TAX_CODE = re.compile(r"\d{10}(-\d{3})?")
WEBSITE = re.compile(r"https?://\S+")


def check_phone(raw: str) -> str:
    phone = normalize_phone(raw)
    if phone is None or not PHONE.fullmatch(phone):
        raise ValueError("Số điện thoại không hợp lệ.")
    return phone


def check_tax_code(raw: str) -> str:
    value = raw.strip()
    if not TAX_CODE.fullmatch(value):
        raise ValueError("Mã số thuế gồm 10 hoặc 13 chữ số (dạng 0309390732 hoặc 0309390732-001).")
    return value


def check_website(raw: str) -> str:
    value = raw.strip()
    if len(value) > 255 or not WEBSITE.fullmatch(value):
        raise ValueError("Website phải bắt đầu bằng http:// hoặc https://.")
    return value
