"""Shared cell formatting for the Excel-friendly CSV exports (M20-05 customers, M20-08 employees):
UTF-8 BOM per Q100, formula-injection escaped like the report exports, leading zeros kept per Q133."""

import csv
import io
import re
from collections.abc import Iterable, Sequence
from datetime import date, datetime
from zoneinfo import ZoneInfo

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
GENDER_LABELS = {"MALE": "Nam", "FEMALE": "Nữ", "OTHER": "Khác"}

_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
_DIGITS = re.compile(r"[0-9]+")


def text(value: str | None) -> str:
    """Neutralize Excel/Sheets formula injection (CWE-1236), same rule as `dashboard/cards.py`."""
    if not value:
        return ""
    return f"'{value}" if value.startswith(_CSV_FORMULA_PREFIXES) else value


def number_text(value: str | None) -> str:
    """Q133: `="0901234567"` so Excel keeps the leading zero; only for all-digit values."""
    if value and _DIGITS.fullmatch(value):
        return f'="{value}"'
    return text(value)


def day(value: date | None) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def moment(value: datetime) -> str:
    return value.astimezone(VIETNAM).strftime("%d/%m/%Y %H:%M")


def to_bytes(header: Sequence[str], rows: Iterable[Sequence[str]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return ("﻿" + buffer.getvalue()).encode("utf-8")
