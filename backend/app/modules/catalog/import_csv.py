"""CSV import for products & services (M2-03a): parse, validate, and write.

Kept separate from `domain.py` because `schemas.py` already imports `domain.py` — importing
`schemas.py` back from `domain.py` (needed here for `ProductCreate`/`ServiceCreate`) would cycle.
"""

import csv
import io
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.catalog.models import Product, Service
from app.modules.catalog.schemas import ProductCreate, ServiceCreate

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ROWS = 500

PRODUCT_COLUMNS = (
    "sku",
    "name",
    "category",
    "brand",
    "unit",
    "price",
    "vat_rate",
    "price_fixed",
    "warranty_months",
    "specs",
)
PRODUCT_REQUIRED = ("sku", "name", "category", "unit", "price")
PRODUCT_DEFAULTABLE = ("vat_rate", "price_fixed")

SERVICE_COLUMNS = (
    "code",
    "name",
    "category",
    "unit",
    "price",
    "vat_rate",
    "price_fixed",
    "default_estimated_hours",
    "description",
)
SERVICE_REQUIRED = ("code", "name", "category", "unit", "price")
SERVICE_DEFAULTABLE = ("vat_rate", "price_fixed")

Kind = Literal["product", "service"]

_KEY_FIELD = {"product": "sku", "service": "code"}
_MODEL_CLASS: dict[str, type[BaseModel]] = {"product": ProductCreate, "service": ServiceCreate}
_COLUMNS = {"product": PRODUCT_COLUMNS, "service": SERVICE_COLUMNS}
_REQUIRED = {"product": PRODUCT_REQUIRED, "service": SERVICE_REQUIRED}
_DEFAULTABLE = {"product": PRODUCT_DEFAULTABLE, "service": SERVICE_DEFAULTABLE}

_CODE_MAP = {
    "missing": "required",
    "literal_error": "invalid_enum",
    "int_parsing": "invalid_number",
    "int_type": "invalid_number",
    "decimal_parsing": "invalid_number",
    "bool_parsing": "invalid_boolean",
    "bool_type": "invalid_boolean",
    "greater_than_equal": "invalid_number",
    "string_too_short": "required",
    "string_too_long": "too_long",
    "value_error": "invalid_value",
}
_MESSAGES = {
    "required": "Bắt buộc nhập.",
    "invalid_enum": "Giá trị không hợp lệ.",
    "invalid_number": "Số không hợp lệ.",
    "invalid_boolean": "Giá trị đúng/sai không hợp lệ (true/false).",
    "too_long": "Quá độ dài cho phép.",
    "invalid_value": "Giá trị không hợp lệ.",
}


@dataclass
class RowResult:
    line: int
    data: dict[str, Any]
    errors: list[dict[str, str]] | None
    parsed: BaseModel | None


def _detail_for(missing: list[str]) -> str:
    return f"Thiếu cột bắt buộc: {', '.join(missing)}."


def read_rows(file_bytes: bytes, kind: Kind) -> list[tuple[int, dict[str, str]]]:
    if len(file_bytes) > MAX_FILE_BYTES:
        raise AppError(422, "FILE_TOO_LARGE", "Tệp vượt quá 2MB.")
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise AppError(422, "INVALID_FILE", "Tệp không phải CSV hợp lệ (cần mã hoá UTF-8).") from exc
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = reader.fieldnames or []
    missing = [c for c in _REQUIRED[kind] if c not in fieldnames]
    if missing:
        raise AppError(422, "MISSING_COLUMNS", _detail_for(missing))
    rows = list(enumerate(reader, start=2))
    if not rows:
        raise AppError(422, "EMPTY_FILE", "Tệp không có dòng dữ liệu.")
    if len(rows) > MAX_ROWS:
        raise AppError(422, "TOO_MANY_ROWS", f"Vượt quá giới hạn {MAX_ROWS} dòng mỗi lần nhập.")
    return rows


def _message_for(code: str, err: Mapping[str, Any]) -> str:
    if code == "invalid_value":
        ctx = err.get("ctx") or {}
        if "error" in ctx:
            return str(ctx["error"])
    return _MESSAGES.get(code, "Giá trị không hợp lệ.")


def _validate_one(
    kind: Kind, raw: dict[str, str]
) -> tuple[dict[str, Any], list[dict[str, str]] | None, BaseModel | None]:
    columns = _COLUMNS[kind]
    required = _REQUIRED[kind]
    defaultable = _DEFAULTABLE[kind]
    data: dict[str, Any] = {}
    kwargs: dict[str, Any] = {}
    for col in columns:
        value = (raw.get(col) or "").strip()
        data[col] = value or None
        if col in required:
            kwargs[col] = value
        elif col in defaultable:
            if value:
                kwargs[col] = value
        else:
            kwargs[col] = value or None

    model_class = _MODEL_CLASS[kind]
    try:
        parsed = model_class(**kwargs)
    except ValidationError as exc:
        errors = []
        for err in exc.errors():
            field = str(err["loc"][0]) if err["loc"] else "body"
            code = _CODE_MAP.get(str(err["type"]), str(err["type"]))
            errors.append({"field": field, "code": code, "message": _message_for(code, err)})
        return data, errors, None
    return data, None, parsed


def validate_rows(kind: Kind, raw_rows: list[tuple[int, dict[str, str]]]) -> list[RowResult]:
    results = [RowResult(line, *_validate_one(kind, raw)) for line, raw in raw_rows]

    key_field = _KEY_FIELD[kind]
    seen: dict[str, int] = {}
    for result in results:
        raw_key = result.data.get(key_field)
        if not raw_key:
            continue
        norm = raw_key.strip().casefold()
        if norm in seen:
            error = {
                "field": key_field,
                "code": "duplicate_in_file",
                "message": "Trùng với một dòng khác trong tệp.",
            }
            result.errors = [*(result.errors or []), error]
            result.parsed = None
        else:
            seen[norm] = result.line
    return results


def mark_taken(session: Session, kind: Kind, results: list[RowResult], *, taken_message: str) -> None:
    key_field = _KEY_FIELD[kind]
    column = Product.sku if kind == "product" else Service.code

    candidates = {
        result.data[key_field]: result
        for result in results
        if result.errors is None and result.data.get(key_field)
    }
    if not candidates:
        return
    taken = set(session.scalars(select(column).where(column.in_(candidates.keys()))).all())
    for value, result in candidates.items():
        if value in taken:
            result.errors = [{"field": key_field, "code": "taken", "message": taken_message}]
            result.parsed = None


def build_preview(results: list[RowResult]) -> dict[str, Any]:
    invalid = sum(1 for r in results if r.errors is not None)
    return {
        "total": len(results),
        "valid_count": len(results) - invalid,
        "invalid_count": invalid,
        "rows": [{"line": r.line, "data": r.data, "errors": r.errors} for r in results],
    }
