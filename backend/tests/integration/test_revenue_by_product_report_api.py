"""M24-01a: báo cáo doanh thu theo nhóm SP/DV hoặc từng SP/DV (AC-RPT-139…151)."""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, Person, seed
from tests.integration.test_dispatch_api import HOA, client_as, problem
from tests.integration.test_orders_api import insert_product, insert_service
from tests.integration.test_revenue_report_api import DUC, insert_order

TUAN = Person("tuan.sale@smyou.vn", "Tuan@SmYou26", ("SALE",), "NV019", "Trần Minh Tuấn", "SALES")

COMPLETED_IN_RANGE = datetime(2026, 9, 10, 3, 0, tzinfo=UTC)  # 2026-09-10 10:00 giờ VN
CREATED_IN_RANGE = datetime(2026, 9, 12, 3, 0, tzinfo=UTC)
URL = "/api/v1/reports/revenue-by-product"


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, DUC)}


def body(res: Any) -> Any:
    assert res.status_code == 200, res.text
    return res.json()


def insert_group(db: Connection, name: str) -> tuple[uuid.UUID, str]:
    group_id = uuid.uuid4()
    name = f"{name} {group_id.hex[:6]}"  # migrations already seed the real group names
    db.execute(
        text("INSERT INTO product_service_groups (id, name) VALUES (:id, :n)"), {"id": group_id, "n": name}
    )
    return group_id, name


def order(
    db: Connection,
    created_by: uuid.UUID,
    code: str,
    *,
    division_id: uuid.UUID | None,
    status: str = "COMPLETED",
    created_at: datetime | None = None,
) -> uuid.UUID:
    order_id = insert_order(
        db,
        customer_id=None,
        created_by=created_by,
        status=status,
        code=code,
        completed_at=COMPLETED_IN_RANGE if status == "COMPLETED" else None,
        created_at=created_at,
    )
    db.execute(text("UPDATE orders SET division_id = :d WHERE id = :id"), {"d": division_id, "id": order_id})
    return order_id


def line(
    db: Connection,
    order_id: uuid.UUID,
    *,
    position: int,
    item_type: str,
    name: str,
    unit: str,
    quantity: str,
    line_total: int,
    cost: int | None,
    product_id: uuid.UUID | None = None,
    service_id: uuid.UUID | None = None,
    credited_employee_id: uuid.UUID | None = None,
) -> uuid.UUID:
    line_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO order_lines (id, order_id, position, item_type, product_id, service_id,"
            " name_snapshot,"
            " unit_snapshot, vat_rate, quantity, unit_price, line_gross, line_vat, line_total,"
            " cost_price_snapshot, credited_employee_id)"
            " VALUES (:id, :order_id, :position, :item_type, :product_id, :service_id, :name, :unit, 0,"
            " :quantity, :unit_price, :line_total, 0, :line_total, :cost, :credited)"
        ),
        {
            "id": line_id,
            "order_id": order_id,
            "position": position,
            "item_type": item_type,
            "product_id": product_id,
            "service_id": service_id,
            "name": name,
            "unit": unit,
            "quantity": Decimal(quantity),
            "unit_price": int(Decimal(line_total) / Decimal(quantity)),
            "line_total": line_total,
            "cost": cost,
            "credited": credited_employee_id,
        },
    )
    return line_id


@dataclass
class Scenario:
    security_id: uuid.UUID
    security_name: str
    office_id: uuid.UUID
    office_name: str
    camera_id: uuid.UUID
    install_id: uuid.UUID
    printer_id: uuid.UUID
    order_a: uuid.UUID
    order_b: uuid.UUID


def seed_ac139(db: Connection, people: dict[str, uuid.UUID], *, credit: bool = False) -> Scenario:
    security_id, security_name = insert_group(db, "Thiết bị an ninh")
    office_id, office_name = insert_group(db, "Thiết bị văn phòng")
    camera_id = insert_product(
        db,
        {
            "sku": "CAM-DH2MP",
            "name": "Camera Dahua 2MP",
            "category": "CAMERA",
            "unit": "CAI",
            "price": 1_100_000,
            "vat_rate": Decimal("0"),
            "price_fixed": False,
        },
    )
    printer_id = insert_product(
        db,
        {
            "sku": "MI-LBP2900",
            "name": "Máy in Canon LBP2900",
            "category": "PRINTER",
            "unit": "CAI",
            "price": 3_850_000,
            "vat_rate": Decimal("0"),
            "price_fixed": False,
        },
    )
    install_id = insert_service(
        db,
        {
            "code": "DV-LDCAM",
            "name": "Lắp đặt camera",
            "category": "INSTALLATION",
            "unit": "DIEM",
            "price": 300_000,
            "vat_rate": Decimal("0"),
            "price_fixed": False,
        },
    )
    order_a = order(db, people["NV001"], "DHA", division_id=security_id)
    line(
        db,
        order_a,
        position=1,
        item_type="PRODUCT",
        product_id=camera_id,
        name="Camera Dahua 2MP",
        unit="CAI",
        quantity="4",
        line_total=4_400_000,
        cost=800_000,
        credited_employee_id=people["NV005"] if credit else None,
    )
    line(
        db,
        order_a,
        position=2,
        item_type="SERVICE",
        service_id=install_id,
        name="Lắp đặt camera",
        unit="DIEM",
        quantity="4",
        line_total=1_200_000,
        cost=150_000,
        credited_employee_id=people["NV019"] if credit else None,
    )
    order_b = order(db, people["NV001"], "DHB", division_id=office_id)
    line(
        db,
        order_b,
        position=1,
        item_type="PRODUCT",
        product_id=printer_id,
        name="Máy in Canon LBP2900",
        unit="CAI",
        quantity="1",
        line_total=3_850_000,
        cost=3_000_000,
    )
    return Scenario(
        security_id,
        security_name,
        office_id,
        office_name,
        camera_id,
        install_id,
        printer_id,
        order_a,
        order_b,
    )


def test_revenue_by_product_capability_declared() -> None:
    from app.main import create_app

    app = create_app()
    routes = {(method, path): capability for method, path, capability in declared_routes(app)}
    for path in (URL, f"{URL}/lines", f"{URL}/export"):
        assert routes[("GET", path)] == "report.revenue.read"


@pytest.mark.ac("AC-RPT-139")
def test_group_mode_totals_by_order_group(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    s = seed_ac139(db, people)

    data = body(client_as(app, AN).get(URL))

    assert data["mode"] == "group"
    assert [r["key"] for r in data["items"]] == [f"group:{s.security_id}", f"group:{s.office_id}"]
    first, second = data["items"]
    assert (first["label"], first["subtotal_revenue"], first["profit"], first["order_count"]) == (
        s.security_name,
        5_600_000,
        1_800_000,
        1,
    )
    assert (second["label"], second["subtotal_revenue"], second["profit"], second["order_count"]) == (
        s.office_name,
        3_850_000,
        850_000,
        1,
    )
    assert first["item_type"] is None
    assert first["quantity"] is None
    assert data["summary"] == {"subtotal_revenue": 9_450_000, "profit": 2_650_000}
    assert data["total"] == 2


@pytest.mark.ac("AC-RPT-140")
def test_item_mode_rows_per_product_sorted_by_revenue(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    s = seed_ac139(db, people)

    data = body(client_as(app, AN).get(URL, params={"mode": "item"}))

    assert data["mode"] == "item"
    assert [r["label"] for r in data["items"]] == [
        "Camera Dahua 2MP",
        "Máy in Canon LBP2900",
        "Lắp đặt camera",
    ]
    camera, printer, install = data["items"]
    assert camera["key"] == f"product:{s.camera_id}"
    assert (camera["code"], camera["item_type"], camera["unit"]) == ("CAM-DH2MP", "PRODUCT", "CAI")
    assert Decimal(camera["quantity"]) == 4
    assert (camera["subtotal_revenue"], camera["profit"], camera["order_count"]) == (4_400_000, 1_200_000, 1)
    assert printer["subtotal_revenue"] == 3_850_000
    assert (install["key"], install["item_type"], install["code"]) == (
        f"service:{s.install_id}",
        "SERVICE",
        "DV-LDCAM",
    )
    assert (install["subtotal_revenue"], install["profit"]) == (1_200_000, 600_000)


@pytest.mark.ac("AC-RPT-141")
def test_item_mode_one_row_per_product_with_current_catalog_name(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    s = seed_ac139(db, people)
    order_c = order(db, people["NV001"], "DHC", division_id=s.security_id)
    line(
        db,
        order_c,
        position=1,
        item_type="PRODUCT",
        product_id=s.camera_id,
        name="Camera Dahua 2MP",
        unit="CAI",
        quantity="2",
        line_total=2_200_000,
        cost=800_000,
    )
    db.execute(
        text("UPDATE products SET name = 'Camera Dahua 2MP HFW1230' WHERE id = :id"), {"id": s.camera_id}
    )

    data = body(client_as(app, AN).get(URL, params={"mode": "item"}))

    camera_rows = [r for r in data["items"] if r["key"] == f"product:{s.camera_id}"]
    assert len(camera_rows) == 1
    assert camera_rows[0]["label"] == "Camera Dahua 2MP HFW1230"
    assert camera_rows[0]["order_count"] == 2
    assert Decimal(camera_rows[0]["quantity"]) == 6
    assert camera_rows[0]["subtotal_revenue"] == 6_600_000


@pytest.mark.ac("AC-RPT-142")
def test_group_mode_ungrouped_orders_last(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac139(db, people)
    order_d = order(db, people["NV001"], "DHD", division_id=None)
    line(
        db,
        order_d,
        position=1,
        item_type="CUSTOM",
        name="Vệ sinh máy",
        unit="LAN",
        quantity="1",
        line_total=500_000,
        cost=100_000,
    )
    # Bigger than every group, still listed last.
    order_d2 = order(db, people["NV001"], "DHD2", division_id=None)
    line(
        db,
        order_d2,
        position=1,
        item_type="CUSTOM",
        name="Thi công tủ rack",
        unit="LAN",
        quantity="1",
        line_total=9_000_000,
        cost=1_000_000,
    )

    data = body(client_as(app, AN).get(URL, params={"mode": "group"}))

    last = data["items"][-1]
    assert (last["key"], last["label"], last["subtotal_revenue"], last["order_count"]) == (
        "ungrouped",
        "Chưa phân nhóm",
        9_500_000,
        2,
    )
    assert len(data["items"]) == 3


@pytest.mark.ac("AC-RPT-143")
def test_item_mode_custom_lines_grouped_by_name(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_x = order(db, people["NV001"], "DHX", division_id=None)
    for position in (1, 2):
        line(
            db,
            order_x,
            position=position,
            item_type="CUSTOM",
            name="Dây cáp mạng Cat6",
            unit="MET",
            quantity="10",
            line_total=100_000,
            cost=5_000,
        )

    data = body(client_as(app, AN).get(URL, params={"mode": "item"}))

    assert len(data["items"]) == 1
    row = data["items"][0]
    assert (row["key"], row["item_type"], row["code"], row["label"], row["unit"]) == (
        "custom:Dây cáp mạng Cat6",
        "CUSTOM",
        None,
        "Dây cáp mạng Cat6",
        "MET",
    )
    assert Decimal(row["quantity"]) == 20
    assert (row["subtotal_revenue"], row["profit"], row["order_count"]) == (200_000, 100_000, 1)


@pytest.mark.ac("AC-RPT-144")
def test_group_filter_limits_to_orders_of_that_group(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    s = seed_ac139(db, people)
    order_d = order(db, people["NV001"], "DHD", division_id=None)
    line(
        db,
        order_d,
        position=1,
        item_type="CUSTOM",
        name="Vệ sinh máy",
        unit="LAN",
        quantity="1",
        line_total=500_000,
        cost=100_000,
    )
    an = client_as(app, AN)

    data = body(an.get(URL, params={"mode": "item", "group_id": str(s.security_id)}))
    assert [r["label"] for r in data["items"]] == ["Camera Dahua 2MP", "Lắp đặt camera"]

    ungrouped = body(an.get(URL, params={"mode": "item", "group_id": "ungrouped"}))
    assert [r["label"] for r in ungrouped["items"]] == ["Vệ sinh máy"]

    problem(an.get(URL, params={"group_id": "abc"}), 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-RPT-145")
def test_sale_sees_only_lines_credited_to_them(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    s = seed_ac139(db, people, credit=True)
    hoa = client_as(app, HOA)

    data = body(hoa.get(URL, params={"mode": "item"}))
    assert [r["key"] for r in data["items"]] == [f"product:{s.camera_id}"]
    assert data["summary"]["subtotal_revenue"] == 4_400_000

    grouped = body(hoa.get(URL))
    assert [(r["key"], r["subtotal_revenue"]) for r in grouped["items"]] == [
        (f"group:{s.security_id}", 4_400_000)
    ]

    install_lines = body(hoa.get(f"{URL}/lines", params={"mode": "item", "key": f"service:{s.install_id}"}))
    assert install_lines == []


@pytest.mark.ac("AC-RPT-146")
def test_not_completed_counts_only_open_orders(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac139(db, people)  # COMPLETED orders — excluded from NOT_COMPLETED
    for code, status, total in (
        ("DHE", "IN_PROGRESS", 700_000),
        ("DHF", "CANCELLED", 1),
        ("DHG", "DRAFT", 2),
    ):
        order_id = order(
            db, people["NV001"], code, division_id=None, status=status, created_at=CREATED_IN_RANGE
        )
        line(
            db,
            order_id,
            position=1,
            item_type="CUSTOM",
            name=f"Hàng {code}",
            unit="CAI",
            quantity="1",
            line_total=total,
            cost=0,
        )

    data = body(client_as(app, AN).get(URL, params={"status": "NOT_COMPLETED", "mode": "item"}))

    assert [r["label"] for r in data["items"]] == ["Hàng DHE"]
    assert data["summary"]["subtotal_revenue"] == 700_000


@pytest.mark.ac("AC-RPT-147")
def test_lines_drilldown_for_one_product(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    s = seed_ac139(db, people)
    an = client_as(app, AN)

    rows = body(an.get(f"{URL}/lines", params={"mode": "item", "key": f"product:{s.camera_id}"}))
    assert len(rows) == 1
    assert rows[0]["order_code"] == "DHA"
    assert Decimal(rows[0]["quantity"]) == 4
    assert rows[0]["line_total"] == 4_400_000
    assert rows[0]["profit"] == 1_200_000

    group_rows = body(an.get(f"{URL}/lines", params={"mode": "group", "key": f"group:{s.security_id}"}))
    assert sorted(r["line_total"] for r in group_rows) == [1_200_000, 4_400_000]


@pytest.mark.ac("AC-RPT-148")
@pytest.mark.parametrize(
    "params",
    [
        {"mode": "group", "key": f"product:{uuid.uuid4()}"},
        {"mode": "item", "key": f"group:{uuid.uuid4()}"},
        {"mode": "item", "key": "ungrouped"},
        {"mode": "item", "key": "abc"},
        {"mode": "item", "key": "product:not-a-uuid"},
        {"mode": "item"},
    ],
)
def test_lines_rejects_malformed_or_mismatched_key(
    app: FastAPI, people: dict[str, uuid.UUID], params: dict[str, str]
) -> None:
    res = client_as(app, AN).get(f"{URL}/lines", params=params)
    assert res.status_code == 422, res.text


@pytest.mark.ac("AC-RPT-149")
def test_technician_forbidden_on_all_endpoints(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    duc = client_as(app, DUC)
    problem(duc.get(URL), 403, "FORBIDDEN")
    problem(duc.get(f"{URL}/lines", params={"mode": "group", "key": "ungrouped"}), 403, "FORBIDDEN")
    problem(duc.get(f"{URL}/export"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-RPT-150")
def test_export_item_mode_csv(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac139(db, people)
    params = {"mode": "item", "from": "2026-09-01", "to": "2026-09-26"}

    res = client_as(app, AN).get(f"{URL}/export", params=params)

    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    assert "doanh-thu-theo-san-pham-2026-09-01_2026-09-26.csv" in res.headers["content-disposition"]
    assert res.content.startswith("﻿".encode())
    rows = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert rows[0] == ["Mã", "Tên", "Loại", "ĐVT", "Số lượng", "Số đơn", "Doanh thu", "Lợi nhuận"]
    assert rows[1][0:3] == ["CAM-DH2MP", "Camera Dahua 2MP", "Sản phẩm"]
    assert Decimal(rows[1][4]) == 4
    assert rows[1][4] == "4"  # no trailing ".000" from numeric(…,3)
    assert rows[1][5:] == ["1", "4400000", "1200000"]
    assert len(rows) == 4


@pytest.mark.ac("AC-RPT-150")
def test_export_group_mode_filename(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    s = seed_ac139(db, people)
    params = {"from": "2026-09-01", "to": "2026-09-26"}

    res = client_as(app, AN).get(f"{URL}/export", params=params)

    assert res.status_code == 200, res.text
    assert "doanh-thu-theo-nhom-sp-dv-2026-09-01_2026-09-26.csv" in res.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert rows[1][0] == s.security_name
    assert rows[1][-2:] == ["5600000", "1800000"]


@pytest.mark.ac("AC-RPT-151")
def test_missing_cost_price_makes_group_and_summary_profit_null(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    s = seed_ac139(db, people)
    line(
        db,
        s.order_b,
        position=2,
        item_type="CUSTOM",
        name="Hàng cũ",
        unit="CAI",
        quantity="1",
        line_total=100_000,
        cost=None,
    )

    data = body(client_as(app, AN).get(URL))

    rows = {r["key"]: r for r in data["items"]}
    assert rows[f"group:{s.office_id}"]["profit"] is None
    assert rows[f"group:{s.security_id}"]["profit"] == 1_800_000
    assert data["summary"] == {"subtotal_revenue": 9_550_000, "profit": None}


@pytest.mark.ac("AC-RPT-143")
def test_item_mode_custom_names_merge_ignoring_case_and_outer_spaces(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    # Chủ SP 2026-11-05: "Cáp" và "cáp" là 1 dòng (cập nhật Q177).
    order_x = order(db, people["NV001"], "DHX", division_id=None)
    order_y = order(db, people["NV001"], "DHY", division_id=None)
    for order_id, name in ((order_x, "QA Cáp"), (order_y, "  qa cáp ")):
        line(
            db,
            order_id,
            position=1,
            item_type="CUSTOM",
            name=name,
            unit="MET",
            quantity="5",
            line_total=50_000,
            cost=2_000,
        )
    an = client_as(app, AN)

    data = body(an.get(URL, params={"mode": "item"}))

    assert len(data["items"]) == 1
    row = data["items"][0]
    assert (row["key"], row["label"], row["order_count"], row["subtotal_revenue"]) == (
        "custom:QA Cáp",
        "QA Cáp",
        2,
        100_000,
    )
    assert Decimal(row["quantity"]) == 10
    for key in ("custom:QA Cáp", "custom:qa cáp", "custom: QA CÁP "):
        lines = body(an.get(f"{URL}/lines", params={"mode": "item", "key": key}))
        assert sorted(r["order_code"] for r in lines) == ["DHX", "DHY"]
    res = an.get(f"{URL}/lines", params={"mode": "item", "key": "custom:   "})
    assert res.status_code == 422, res.text
