"""Request/response bodies for /api/v1/orders (M3-02a)."""

import uuid
from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationInfo, field_validator

from app.modules.catalog.domain import vat_rate_problem
from app.modules.catalog.schemas import ServiceUnit
from app.modules.identity.schemas import Email

Division = Literal["OFFICE_EQUIPMENT", "SECURITY", "GENERAL"]
Priority = Literal["LOW", "NORMAL", "HIGH", "URGENT"]
OrderStatus = Literal[
    "DRAFT",
    "PENDING_DISPATCH",
    "IN_PROGRESS",
    "AWAITING_CONFIRMATION",
    "COMPLETED",
    "REVISION",
    "CANCELLED",
]
PaymentStatus = Literal["UNPAID", "PAID", "PAY_LATER"]
PaymentMethod = Literal["CASH", "BANK_TRANSFER"]
ItemType = Literal["PRODUCT", "SERVICE", "CUSTOM"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
TaxCode = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)]

PAYMENT_METHOD_REQUIRED = "Chọn hình thức thanh toán khi đơn đã thu tiền."
FIELD_REQUIRED = "Bắt buộc nhập."


def _check_vat_rate(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    problem = vat_rate_problem(value)
    if problem is not None:
        raise ValueError(problem)
    return value


def _check_payment_method(value: PaymentMethod | None, info: ValidationInfo) -> PaymentMethod | None:
    payment_status = info.data.get("payment_status")
    if payment_status == "PAID" and value is None:
        raise ValueError(PAYMENT_METHOD_REQUIRED)
    return value


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: uuid.UUID | None = None
    customer_name: Name | None = None
    customer_phone: str | None = None
    customer_email: Email | None = None
    customer_tax_code: TaxCode | None = None
    division: Division | None = None
    service_address: str | None = None
    work_description: str | None = None
    priority: Priority = "NORMAL"
    requested_date: date | None = None
    payment_status: PaymentStatus = "UNPAID"
    payment_method: PaymentMethod | None = Field(default=None, validate_default=True)

    _check_payment_method = field_validator("payment_method")(_check_payment_method)


class OrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    customer_id: uuid.UUID | None = None
    customer_name: Name | None = None
    customer_phone: str | None = None
    customer_email: Email | None = None
    customer_tax_code: TaxCode | None = None
    division: Division | None = None
    service_address: str | None = None
    work_description: str | None = None
    priority: Priority | None = None
    requested_date: date | None = None
    payment_status: PaymentStatus | None = None
    payment_method: PaymentMethod | None = Field(default=None, validate_default=True)

    _check_payment_method = field_validator("payment_method")(_check_payment_method)


def _required_when(item_type: str) -> Callable[[object, ValidationInfo], object]:
    def _check(value: object, info: ValidationInfo) -> object:
        if info.data.get("item_type") == item_type and value is None:
            raise ValueError(FIELD_REQUIRED)
        return value

    return _check


class OrderLineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    item_type: ItemType
    product_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    name: Name | None = None
    unit: ServiceUnit | None = None
    specs: str | None = None
    warranty_months: Annotated[int, Field(ge=0)] | None = None
    quantity: Annotated[Decimal, Field(gt=0)]
    unit_price: Annotated[int, Field(ge=0)]
    vat_rate: Decimal | None = None
    is_gift: bool = False
    line_discount: Annotated[int, Field(ge=0)] = 0
    note: str | None = None

    _check_product_id = field_validator("product_id")(_required_when("PRODUCT"))
    _check_service_id = field_validator("service_id")(_required_when("SERVICE"))
    _check_name = field_validator("name")(_required_when("CUSTOM"))
    _check_unit = field_validator("unit")(_required_when("CUSTOM"))
    _check_vat_rate = field_validator("vat_rate")(_check_vat_rate)


class OrderLineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    quantity: Annotated[Decimal, Field(gt=0)] | None = None
    unit_price: Annotated[int, Field(ge=0)] | None = None
    vat_rate: Decimal | None = None
    is_gift: bool | None = None
    line_discount: Annotated[int, Field(ge=0)] | None = None
    note: str | None = None

    _check_vat_rate = field_validator("vat_rate")(_check_vat_rate)


class OrderLineRemove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int


class OrderCommand(BaseModel):
    """Body for `submit`/`recall` — no extra fields beyond the concurrency token."""

    model_config = ConfigDict(extra="forbid")

    version: int


class OrderCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    reason: str | None = None


class OrderLineOut(BaseModel):
    id: uuid.UUID
    position: int
    item_type: str
    product_id: uuid.UUID | None
    service_id: uuid.UUID | None
    sku_snapshot: str | None
    name_snapshot: str
    unit_snapshot: str
    specs_snapshot: str | None
    warranty_months_snapshot: int | None
    catalog_price_snapshot: int | None
    price_fixed: bool
    vat_rate: Decimal
    quantity: Decimal
    unit_price: int
    is_gift: bool
    line_discount: int
    line_gross: int
    line_vat: int
    line_total: int
    note: str | None


class OrderDetail(BaseModel):
    id: uuid.UUID
    code: str
    status: str
    division: str | None
    customer_id: uuid.UUID | None
    customer_name: str | None
    customer_phone: str | None
    customer_email: str | None
    customer_tax_code: str | None
    service_address: str
    work_description: str
    priority: str
    requested_date: date | None
    subtotal: int
    discount_amount: int
    vat_amount: int
    total: int
    payment_status: str
    payment_method: str | None
    revision_no: int
    created_by: uuid.UUID
    version: int
    lines: list[OrderLineOut]
    allowed_commands: list[str]


class OrderSummary(BaseModel):
    id: uuid.UUID
    code: str
    status: str
    customer_name: str | None
    customer_phone: str | None
    division: str | None
    priority: str
    total: int
    requested_date: date | None
    created_by: uuid.UUID
    created_by_name: str | None
    created_at: datetime


class OrderPage(BaseModel):
    items: list[OrderSummary]
    total: int
    limit: int
    offset: int
