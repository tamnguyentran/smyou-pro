"""Request/response bodies for /api/v1/products and /api/v1/services."""

import uuid
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.modules.catalog.domain import vat_rate_problem

Category = Literal[
    "PC",
    "LAPTOP",
    "MONITOR",
    "PRINTER",
    "SCANNER",
    "PRINTER_SUPPLY",
    "CAMERA",
    "RECORDER",
    "STORAGE",
    "NETWORK",
    "ACCESSORY",
    "MATERIAL",
    "SOFTWARE",
    "OTHER",
]
Unit = Literal["CAI", "MAY", "BO", "MET", "CUON", "HOP", "LICENSE"]
Sku = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Brand = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]

ServiceCategory = Literal[
    "INSTALLATION", "REPAIR", "MAINTENANCE", "REFILL", "SOFTWARE", "NETWORK_CABLING", "OTHER"
]
ServiceUnit = Literal["CAI", "MAY", "BO", "MET", "CUON", "HOP", "LICENSE", "LAN", "DIEM", "GIO"]
ServiceCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


def _check_vat_rate(value: Decimal | None) -> Decimal | None:
    problem = vat_rate_problem(value)
    if problem is not None:
        raise ValueError(problem)
    return value


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: Sku
    name: Name
    category: Category
    brand: Brand | None = None
    unit: Unit
    price: Annotated[int, Field(ge=0)]
    vat_rate: Decimal = Decimal("8")
    price_fixed: bool = False
    warranty_months: Annotated[int, Field(ge=0)] | None = None
    specs: str | None = None

    _check_vat_rate = field_validator("vat_rate")(_check_vat_rate)


class ProductUpdate(BaseModel):
    # sku/category/unit are not editable here: fixed at creation (avoids drifting M3 order snapshots).
    model_config = ConfigDict(extra="forbid")

    version: int
    name: Name | None = None
    brand: Brand | None = None
    price: Annotated[int, Field(ge=0)] | None = None
    vat_rate: Decimal | None = None
    price_fixed: bool | None = None
    warranty_months: Annotated[int, Field(ge=0)] | None = None
    specs: str | None = None

    _check_vat_rate = field_validator("vat_rate")(_check_vat_rate)


class VersionRequest(BaseModel):
    version: int


class ProductOut(BaseModel):
    id: uuid.UUID
    sku: str
    name: str
    category: str
    brand: str | None
    unit: str
    price: int
    vat_rate: Decimal
    price_fixed: bool
    warranty_months: int | None
    specs: str | None
    image_attachment_id: uuid.UUID | None
    is_active: bool
    version: int


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    limit: int
    offset: int


class ImageUploaded(BaseModel):
    image_attachment_id: uuid.UUID


class ServiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: ServiceCode
    name: Name
    category: ServiceCategory
    unit: ServiceUnit
    price: Annotated[int, Field(ge=0)]
    vat_rate: Decimal = Decimal("8")
    price_fixed: bool = False
    default_estimated_hours: Annotated[Decimal, Field(ge=0)] | None = None
    description: str | None = None

    _check_vat_rate = field_validator("vat_rate")(_check_vat_rate)


class ServiceUpdate(BaseModel):
    # code/category/unit are not editable here: fixed at creation (avoids drifting M3 order snapshots).
    model_config = ConfigDict(extra="forbid")

    version: int
    name: Name | None = None
    price: Annotated[int, Field(ge=0)] | None = None
    vat_rate: Decimal | None = None
    price_fixed: bool | None = None
    default_estimated_hours: Annotated[Decimal, Field(ge=0)] | None = None
    description: str | None = None

    _check_vat_rate = field_validator("vat_rate")(_check_vat_rate)


class ServiceOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    category: str
    unit: str
    price: int
    vat_rate: Decimal
    price_fixed: bool
    default_estimated_hours: Decimal | None
    description: str | None
    is_active: bool
    version: int


class ServicePage(BaseModel):
    items: list[ServiceOut]
    total: int
    limit: int
    offset: int


class ImportRowError(BaseModel):
    field: str
    code: str
    message: str


class ImportRow(BaseModel):
    line: int
    data: dict[str, Any]
    errors: list[ImportRowError] | None


class ImportPreview(BaseModel):
    total: int
    valid_count: int
    invalid_count: int
    rows: list[ImportRow]


class ImportCommitResult(BaseModel):
    created: int
