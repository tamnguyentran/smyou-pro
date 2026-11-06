"""M21-08: every new order line needs a catalog cost price; the catalog can no longer clear it
(AC-ORD-252…258, AC-CAT-108/109)."""

import uuid
from decimal import Decimal

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, Person, seed
from tests.integration.test_notifications_api import insert_order
from tests.integration.test_orders_api import (
    HOA,
    audit_rows,
    client_as,
    error_fields,
    insert_product,
    insert_service,
    problem,
)
from tests.integration.test_orders_on_site_lines_api import insert_assignment, insert_task

MINH = Person("minh.ho@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV020", "Hồ Văn Minh", "TECHNICAL")
LAN = Person("lan.tran@smyou.vn", "Lan@SmYou26", ("TECH_LEAD",), "NV010", "Trần Thị Lan", "TECHNICAL")

COST_MISSING = (
    "Sản phẩm/dịch vụ này chưa có giá vốn trong danh mục nên không thể bán."
    " Vui lòng liên hệ Quản lý cập nhật giá vốn."
)
CUSTOM_LINE_DISABLED = "Chỉ được chọn Sản phẩm hoặc Dịch vụ."

LBP2900 = {
    "sku": "LBP2900",
    "name": "Máy in Canon LBP2900",
    "category": "PRINTER",
    "unit": "CAI",
    "price": 4_200_000,
    "cost_price": 2_940_000,
    "vat_rate": Decimal("8"),
    "price_fixed": False,
}
CAM_H265 = {
    "sku": "CAM-H265",
    "name": "Camera Hikvision 2MP",
    "category": "CAMERA",
    "unit": "CAI",
    "price": 1_250_000,
    "cost_price": None,
    "vat_rate": Decimal("8"),
    "price_fixed": False,
}
DV_LD01 = {
    "code": "DV-LD01",
    "name": "Lắp đặt camera",
    "category": "INSTALLATION",
    "unit": "LAN",
    "price": 155_555,
    "cost_price": None,
    "vat_rate": Decimal("8"),
    "price_fixed": False,
}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, LAN, MINH)}


@pytest.fixture
def items(db: Connection) -> dict[str, uuid.UUID]:
    return {
        "LBP2900": insert_product(db, LBP2900),
        "CAM-H265": insert_product(db, CAM_H265),
        "DV-LD01": insert_service(db, DV_LD01),
    }


def product_body(version: int, product_id: uuid.UUID, unit_price: int, **extra: object) -> dict[str, object]:
    return {
        "version": version,
        "item_type": "PRODUCT",
        "product_id": str(product_id),
        "quantity": "1",
        "unit_price": unit_price,
        "vat_rate": "8",
        **extra,
    }


def service_body(version: int, service_id: uuid.UUID) -> dict[str, object]:
    return {
        "version": version,
        "item_type": "SERVICE",
        "service_id": str(service_id),
        "quantity": "1",
        "unit_price": 155_555,
        "vat_rate": "8",
    }


CUSTOM_BODY = {
    "item_type": "CUSTOM",
    "name": "Công tháo dỡ tủ mạng cũ",
    "unit": "LAN",
    "quantity": "1",
    "unit_price": 500_000,
    "vat_rate": "10",
}


def get_order(client: TestClient, order_id: uuid.UUID | str) -> dict:
    res = client.get(f"/api/v1/orders/{order_id}")
    assert res.status_code == 200, res.text
    return res.json()


def assert_cost_missing(res: httpx.Response, field: str) -> None:
    body = problem(res, 422, "ITEM_COST_MISSING")
    assert body["detail"] == COST_MISSING
    errors = body["errors"]
    assert isinstance(errors, list)
    assert errors[0]["field"] == field
    assert errors[0]["message"] == COST_MISSING


def line_action_count(db: Connection, order_id: uuid.UUID | str, action: str) -> int:
    return sum(1 for e in audit_rows(db, uuid.UUID(str(order_id))) if e.action == action)


@pytest.fixture
def submitted(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    """DH2611-0002, owner Hoa, already submitted (IN_PROGRESS) with Minh working on its task."""
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2611-0002")
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS", cycle=1)
    insert_assignment(db, task_id, people["NV020"], "IN_PROGRESS")
    return order_id


@pytest.mark.ac("AC-ORD-252")
def test_draft_line_snapshots_catalog_cost(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json=product_body(order["version"], items["LBP2900"], 4_200_000),
    )

    assert res.status_code == 201, res.text
    assert res.json()["lines"][0]["cost_price_snapshot"] == 2_940_000


@pytest.mark.ac("AC-ORD-253")
def test_draft_line_rejects_product_without_cost(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json=product_body(order["version"], items["CAM-H265"], 1_250_000),
    )

    assert_cost_missing(res, "product_id")
    after = get_order(hoa, order["id"])
    assert after["lines"] == []
    assert after["version"] == order["version"]
    assert line_action_count(db, order["id"], "add_line") == 0


@pytest.mark.ac("AC-ORD-254")
def test_draft_line_rejects_service_without_cost(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines", json=service_body(order["version"], items["DV-LD01"])
    )

    assert_cost_missing(res, "service_id")
    assert get_order(hoa, order["id"])["lines"] == []


@pytest.mark.ac("AC-ORD-255")
def test_line_after_submit_rejects_product_without_cost(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    items: dict[str, uuid.UUID],
    submitted: uuid.UUID,
) -> None:
    an = client_as(app, AN)
    before = get_order(an, submitted)

    res = an.post(
        f"/api/v1/orders/{submitted}/lines-after-submit",
        json=product_body(before["version"], items["CAM-H265"], 1_250_000),
    )

    assert_cost_missing(res, "product_id")
    after = get_order(an, submitted)
    assert after["lines"] == before["lines"]
    assert after["version"] == before["version"]
    assert line_action_count(db, submitted, "add_line_after_submit") == 0


@pytest.mark.ac("AC-ORD-256")
def test_on_site_line_rejects_service_without_cost(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    items: dict[str, uuid.UUID],
    submitted: uuid.UUID,
) -> None:
    minh = client_as(app, MINH)
    before = get_order(minh, submitted)

    res = minh.post(
        f"/api/v1/orders/{submitted}/lines-on-site", json=service_body(before["version"], items["DV-LD01"])
    )

    assert_cost_missing(res, "service_id")
    after = get_order(minh, submitted)
    assert after["lines"] == before["lines"]
    assert line_action_count(db, submitted, "add_line_on_site") == 0


@pytest.mark.ac("AC-ORD-257")
def test_custom_lines_still_rejected(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    items: dict[str, uuid.UUID],
    submitted: uuid.UUID,
) -> None:
    hoa = client_as(app, HOA)
    draft = hoa.post("/api/v1/orders", json={}).json()
    minh = client_as(app, MINH)
    site_version = get_order(minh, submitted)["version"]

    responses = [
        hoa.post(f"/api/v1/orders/{draft['id']}/lines", json={"version": draft["version"], **CUSTOM_BODY}),
        minh.post(f"/api/v1/orders/{submitted}/lines-on-site", json={"version": site_version, **CUSTOM_BODY}),
    ]

    for res in responses:
        body = problem(res, 422, "VALIDATION_ERROR")
        assert error_fields(body) == ["item_type"]
        errors = body["errors"]
        assert isinstance(errors, list)
        assert errors[0]["message"] == CUSTOM_LINE_DISABLED


@pytest.mark.ac("AC-ORD-258")
def test_catalog_cost_change_does_not_touch_existing_line(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    an = client_as(app, AN)
    order = hoa.post("/api/v1/orders", json={}).json()
    order = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json=product_body(order["version"], items["LBP2900"], 4_200_000),
    ).json()
    product = an.get(f"/api/v1/products/{items['LBP2900']}").json()

    patched = an.patch(
        f"/api/v1/products/{items['LBP2900']}", json={"version": product["version"], "cost_price": 3_000_000}
    )
    assert patched.status_code == 200, patched.text
    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json=product_body(order["version"], items["LBP2900"], 4_200_000),
    )

    assert res.status_code == 201, res.text
    assert [line["cost_price_snapshot"] for line in res.json()["lines"]] == [2_940_000, 3_000_000]


def price_history_count(db: Connection, item_id: uuid.UUID) -> int:
    return int(
        db.execute(
            text("SELECT count(*) FROM catalog_price_history WHERE item_id = :id"), {"id": item_id}
        ).scalar_one()
    )


@pytest.mark.ac("AC-CAT-108")
def test_product_cost_price_cannot_be_cleared(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    product_id = items["LBP2900"]
    before = an.get(f"/api/v1/products/{product_id}").json()

    res = an.patch(f"/api/v1/products/{product_id}", json={"version": before["version"], "cost_price": None})

    body = problem(res, 422, "VALIDATION_ERROR")
    assert "cost_price" in error_fields(body)
    assert body["errors"][0]["code"] == "required"
    after = an.get(f"/api/v1/products/{product_id}").json()
    assert (after["cost_price"], after["version"]) == (2_940_000, before["version"])
    assert price_history_count(db, product_id) == 0


@pytest.mark.ac("AC-CAT-109")
def test_service_cost_price_cannot_be_cleared(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    service_id = insert_service(
        db, {**DV_LD01, "code": "DV-BT01", "name": "Bảo trì máy in", "price": 80_000, "cost_price": 50_000}
    )
    an = client_as(app, AN)
    before = an.get(f"/api/v1/services/{service_id}").json()

    res = an.patch(f"/api/v1/services/{service_id}", json={"version": before["version"], "cost_price": None})

    body = problem(res, 422, "VALIDATION_ERROR")
    assert "cost_price" in error_fields(body)
    assert body["errors"][0]["code"] == "required"
    after = an.get(f"/api/v1/services/{service_id}").json()
    assert (after["cost_price"], after["version"]) == (50_000, before["version"])
    assert price_history_count(db, service_id) == 0
