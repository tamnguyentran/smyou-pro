"""M19-01a: technicians add/edit/remove order lines on site (AC-ORD-219…235, AC-NTF-051/052,
AC-CAT-098/099)."""

import json
import uuid
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.spec_loader import load_specs
from tests.integration.conftest import AN, Person, seed
from tests.integration.test_notifications_api import insert_order, notifications_for
from tests.integration.test_orders_api import (
    audit_rows,
    client_as,
    error_fields,
    insert_customer,
    insert_product,
    insert_service,
    problem,
)
from tests.spec_fixtures import REPO_SPEC_DIR

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
LAN = Person("lan.tran@smyou.vn", "Lan@SmYou26", ("TECH_LEAD",), "NV010", "Trần Thị Lan", "TECHNICAL")
MAI = Person("mai.vo@smyou.vn", "Mai@SmYou26", ("CUSTOMER_CARE",), "NV015", "Võ Thị Mai", "SALES")
BINH = Person(
    "binh.nguyen@smyou.vn", "Binh@SmYou26", ("TECHNICIAN",), "NV020", "Nguyễn Văn Bình", "TECHNICAL"
)
CUONG = Person("cuong.le@smyou.vn", "Cuong@SmYou26", ("TECHNICIAN",), "NV021", "Lê Văn Cường", "TECHNICAL")
DUNG = Person("dung.pham@smyou.vn", "Dung@SmYou26", ("TECHNICIAN",), "NV022", "Phạm Văn Dũng", "TECHNICAL")
EM = Person("em.do@smyou.vn", "Em@SmYou26", ("TECHNICIAN",), "NV023", "Đỗ Văn Em", "TECHNICAL")

CODE = "DH2610-0042"
SSD = {
    "sku": "SSD-512",
    "name": "Ổ cứng SSD Kingston 512GB",
    "category": "STORAGE",
    "unit": "CAI",
    "price": 1_250_000,
    "vat_rate": Decimal("8"),
    "price_fixed": True,
}
CAM = {
    "sku": "CAM-DH-2M",
    "name": "Camera Dahua 2MP",
    "category": "CAMERA",
    "unit": "CAI",
    "price": 900_000,
    "vat_rate": Decimal("8"),
    "price_fixed": False,
}
DV_CAP = {
    "code": "DV-CAP",
    "name": "Đi dây cáp mạng",
    "category": "NETWORK_CABLING",
    "unit": "MET",
    "price": 150_000,
    "vat_rate": Decimal("0"),
    "price_fixed": False,
}
NOT_ACTIVE_WORK = "Bạn chỉ thêm/sửa dòng hàng khi đang nhận hoặc thực hiện đầu việc của đơn này."
NOT_OWN_LINE = "Bạn chỉ sửa/xoá được dòng hàng do chính mình thêm."
SELF_CREDIT_ONLY = "Dòng hàng do kỹ thuật viên thêm chỉ ghi doanh số cho chính bạn."
NTF_TYPE = "ORDER_LINES_CHANGED_ON_SITE"


def error_messages(body: dict[str, object]) -> list[str]:
    errors = body["errors"]
    assert isinstance(errors, list)
    return [str(e["message"]) for e in errors]


def insert_task(
    db: Connection, order_id: uuid.UUID, *, created_by: uuid.UUID, status: str, cycle: int
) -> uuid.UUID:
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, cycle, created_by)"
            " VALUES (:id, :order_id, :code, 'Lắp đặt 4 camera', 'INITIAL', 0, :status, 2,"
            " now(), 'NORMAL', :cycle, :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": f"{CODE}-T{uuid.uuid4().hex[:3]}",
            "status": status,
            "cycle": cycle,
            "created_by": created_by,
        },
    )
    return task_id


def insert_assignment(
    db: Connection, task_id: uuid.UUID, employee_id: uuid.UUID, status: str, *, cycle: int = 1
) -> uuid.UUID:
    assignment_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by)"
            " VALUES (:id, :task_id, :employee_id, :cycle, :status, :employee_id)"
        ),
        {
            "id": assignment_id,
            "task_id": task_id,
            "employee_id": employee_id,
            "cycle": cycle,
            "status": status,
        },
    )
    return assignment_id


def insert_line(
    db: Connection,
    order_id: uuid.UUID,
    product_id: uuid.UUID,
    *,
    position: int,
    added_by_id: uuid.UUID | None,
    added_on_site: bool,
) -> uuid.UUID:
    """Camera Dahua 2MP x 1 at 900_000 + 8% VAT = 972_000, also added to the order's totals."""
    line_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO order_lines (id, order_id, position, item_type, product_id, name_snapshot,"
            " unit_snapshot, price_fixed, vat_rate, quantity, unit_price, line_gross, line_vat,"
            " line_total, added_by_id, added_on_site)"
            " VALUES (:id, :order_id, :position, 'PRODUCT', :product_id, 'Camera Dahua 2MP', 'CAI',"
            " false, 8, 1, 900000, 900000, 72000, 972000, :added_by_id, :added_on_site)"
        ),
        {
            "id": line_id,
            "order_id": order_id,
            "position": position,
            "product_id": product_id,
            "added_by_id": added_by_id,
            "added_on_site": added_on_site,
        },
    )
    db.execute(
        text(
            "UPDATE orders SET subtotal = subtotal + 900000, vat_amount = vat_amount + 72000,"
            " total = total + 972000 WHERE id = :id"
        ),
        {"id": order_id},
    )
    return line_id


def set_status(db: Connection, table: str, row_id: uuid.UUID, status: str) -> None:
    assert table in ("orders", "assignments")
    db.execute(text(f"UPDATE {table} SET status = :status WHERE id = :id"), {"id": row_id, "status": status})  # noqa: S608  # table name checked against a literal allow-list above


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, LAN, MAI, BINH, CUONG, DUNG, EM)}


@pytest.fixture
def items(db: Connection) -> dict[str, uuid.UUID]:
    return {
        "SSD-512": insert_product(db, SSD),
        "CAM": insert_product(db, CAM),
        "DV-CAP": insert_service(db, DV_CAP),
    }


@pytest.fixture
def site(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    """DH2610-0042 IN_PROGRESS, owner Hoa; Bình IN_PROGRESS, Dũng REJECTED, Em ACCEPTED on the task."""
    order_id = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code=CODE)
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS", cycle=1)
    return {
        "order": order_id,
        "task": task_id,
        "binh": insert_assignment(db, task_id, people["NV020"], "IN_PROGRESS"),
        "dung": insert_assignment(db, task_id, people["NV022"], "REJECTED"),
        "em": insert_assignment(db, task_id, people["NV023"], "ACCEPTED"),
    }


def ssd_body(version: int, items: dict[str, uuid.UUID], **extra: object) -> dict[str, object]:
    return {
        "version": version,
        "item_type": "PRODUCT",
        "product_id": str(items["SSD-512"]),
        "quantity": "1",
        "unit_price": 1_250_000,
        "vat_rate": "8",
        **extra,
    }


def get_order(client: TestClient, order_id: uuid.UUID) -> dict:
    res = client.get(f"/api/v1/orders/{order_id}")
    assert res.status_code == 200, res.text
    return res.json()


def add_ssd(client: TestClient, order_id: uuid.UUID, items: dict[str, uuid.UUID]) -> dict:
    version = get_order(client, order_id)["version"]
    res = client.post(f"/api/v1/orders/{order_id}/lines-on-site", json=ssd_body(version, items))
    assert res.status_code == 201, res.text
    return res.json()


def ssd_line(order: dict) -> dict:
    return next(line for line in order["lines"] if line["name_snapshot"] == SSD["name"])


@pytest.mark.ac("AC-ORD-219")
def test_technician_adds_fixed_price_product_on_site(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    before = get_order(binh, site["order"])

    res = binh.post(f"/api/v1/orders/{site['order']}/lines-on-site", json=ssd_body(before["version"], items))

    assert res.status_code == 201, res.text
    body = res.json()
    line = ssd_line(body)
    assert line["line_total"] == 1_350_000
    assert line["added_by_id"] == str(people["NV020"])
    assert line["added_on_site"] is True
    assert line["credited_employee_id"] == str(people["NV020"])
    assert body["total"] == before["total"] + 1_350_000
    assert body["version"] == before["version"] + 1
    event = next(e for e in audit_rows(db, site["order"]) if e.action == "add_line_on_site")
    assert event.actor_id == people["NV020"]
    assert event.data == {"line_id": line["id"], "item": SSD["name"], "line_total": 1_350_000}


@pytest.mark.ac("AC-ORD-220")
def test_technician_prices_flexible_service_with_discount_in_revision(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    set_status(db, "orders", site["order"], "REVISION")
    set_status(db, "assignments", site["binh"], "DONE")
    db.execute(text("UPDATE tasks SET cycle = 2 WHERE id = :id"), {"id": site["task"]})
    insert_assignment(db, site["task"], people["NV020"], "ACCEPTED", cycle=2)
    binh = client_as(app, BINH)
    version = get_order(binh, site["order"])["version"]

    res = binh.post(
        f"/api/v1/orders/{site['order']}/lines-on-site",
        json={
            "version": version,
            "item_type": "SERVICE",
            "service_id": str(items["DV-CAP"]),
            "quantity": "20",
            "unit_price": 120_000,
            "vat_rate": "0",
            "line_discount": 100_000,
        },
    )

    assert res.status_code == 201, res.text
    line = next(line for line in res.json()["lines"] if line["name_snapshot"] == DV_CAP["name"])
    assert line["unit_price"] == 120_000
    assert line["line_discount"] == 100_000
    assert line["line_total"] == 2_300_000


@pytest.mark.ac("AC-ORD-221")
def test_technician_cannot_override_fixed_price(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    version = get_order(binh, site["order"])["version"]

    res = binh.post(
        f"/api/v1/orders/{site['order']}/lines-on-site", json=ssd_body(version, items, unit_price=999_000)
    )

    assert error_fields(problem(res, 422, "PRICE_FIXED")) == ["unit_price"]


@pytest.mark.ac("AC-ORD-222")
def test_technician_credit_is_always_self(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    url = f"/api/v1/orders/{site['order']}/lines-on-site"
    version = get_order(binh, site["order"])["version"]

    res = binh.post(url, json=ssd_body(version, items, credited_employee_id=str(people["NV005"])))
    body = problem(res, 422, "VALIDATION_ERROR")
    assert error_fields(body) == ["credited_employee_id"]
    assert error_messages(body) == [SELF_CREDIT_ONLY]

    for extra in ({}, {"credited_employee_id": None}, {"credited_employee_id": str(people["NV020"])}):
        res = binh.post(url, json=ssd_body(version, items, **extra))
        assert res.status_code == 201, (extra, res.text)
        version = res.json()["version"]
        newest = max(res.json()["lines"], key=lambda line: line["position"])
        assert newest["credited_employee_id"] == str(people["NV020"])


@pytest.mark.ac("AC-ORD-223")
def test_unassigned_technician_gets_404(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    cuong = client_as(app, CUONG)

    res = cuong.post(f"/api/v1/orders/{site['order']}/lines-on-site", json=ssd_body(1, items))

    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-ORD-224")
@pytest.mark.parametrize(("person", "status"), [(DUNG, None), (BINH, "PENDING"), (BINH, "DONE")])
def test_inactive_assignment_fails_guard(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    items: dict[str, uuid.UUID],
    site: dict,
    person: Person,
    status: str | None,
) -> None:
    if status is not None:
        set_status(db, "assignments", site["binh"], status)
    client = client_as(app, person)

    res = client.post(f"/api/v1/orders/{site['order']}/lines-on-site", json=ssd_body(1, items))

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "actor_has_active_work_on_order"
    assert body["detail"] == NOT_ACTIVE_WORK


@pytest.mark.ac("AC-ORD-225")
@pytest.mark.parametrize("status", ["AWAITING_CONFIRMATION", "COMPLETED", "CANCELLED"])
def test_locked_order_statuses(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    items: dict[str, uuid.UUID],
    site: dict,
    status: str,
) -> None:
    set_status(db, "orders", site["order"], status)
    binh = client_as(app, BINH)

    res = binh.post(f"/api/v1/orders/{site['order']}/lines-on-site", json=ssd_body(1, items))

    problem(res, 409, "ORDER_LOCKED")


@pytest.mark.ac("AC-ORD-226")
@pytest.mark.parametrize("person", [HOA, AN, LAN, MAI], ids=lambda p: p.roles[0])
def test_non_technician_roles_get_403(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict, person: Person
) -> None:
    client = client_as(app, person)

    res = client.post(f"/api/v1/orders/{site['order']}/lines-on-site", json=ssd_body(1, items))

    problem(res, 403, "FORBIDDEN")


@pytest.mark.ac("AC-ORD-226")
def test_edit_lines_on_site_capability_is_technician_assigned_only() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    assert permissions.capabilities["order.edit_lines_on_site"] == {"TECHNICIAN": "assigned"}


@pytest.mark.ac("AC-ORD-227")
def test_technician_updates_own_line(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    order = add_ssd(binh, site["order"], items)
    line_id = ssd_line(order)["id"]

    res = binh.patch(
        f"/api/v1/orders/{site['order']}/lines-on-site/{line_id}",
        json={"version": order["version"], "quantity": "2"},
    )

    assert res.status_code == 200, res.text
    assert ssd_line(res.json())["line_total"] == 2_700_000
    event = next(e for e in audit_rows(db, site["order"]) if e.action == "update_line_on_site")
    quantity = event.data["changes"]["quantity"]
    assert Decimal(quantity["before"]) == 1
    assert Decimal(quantity["after"]) == 2
    assert event.data["line_id"] == line_id
    assert event.data["item"] == SSD["name"]


@pytest.mark.ac("AC-ORD-228")
def test_technician_removes_own_line(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    order = add_ssd(binh, site["order"], items)
    line_id = ssd_line(order)["id"]

    res = binh.post(
        f"/api/v1/orders/{site['order']}/lines-on-site/{line_id}/remove", json={"version": order["version"]}
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert all(line["id"] != line_id for line in body["lines"])
    assert body["total"] == order["total"] - 1_350_000
    event = next(e for e in audit_rows(db, site["order"]) if e.action == "remove_line_on_site")
    assert event.data["item"] == SSD["name"]
    assert event.data["line_total"] == 1_350_000


@pytest.mark.ac("AC-ORD-229")
def test_technician_cannot_touch_other_peoples_lines(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    sale_line = insert_line(
        db, site["order"], items["CAM"], position=1, added_by_id=people["NV005"], added_on_site=False
    )
    em_line = insert_line(
        db, site["order"], items["CAM"], position=2, added_by_id=people["NV023"], added_on_site=True
    )
    binh = client_as(app, BINH)
    before = get_order(binh, site["order"])
    url = f"/api/v1/orders/{site['order']}/lines-on-site"

    for line_id in (sale_line, em_line):
        res = binh.patch(f"{url}/{line_id}", json={"version": before["version"], "quantity": "5"})
        assert problem(res, 403, "LINE_NOT_EDITABLE")["detail"] == NOT_OWN_LINE
        res = binh.post(f"{url}/{line_id}/remove", json={"version": before["version"]})
        assert problem(res, 403, "LINE_NOT_EDITABLE")["detail"] == NOT_OWN_LINE

    after = get_order(binh, site["order"])
    assert after["lines"] == before["lines"]
    assert after["version"] == before["version"]


@pytest.mark.ac("AC-ORD-230")
def test_technician_cannot_reassign_credit_on_update(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    order = add_ssd(binh, site["order"], items)
    line_id = ssd_line(order)["id"]

    res = binh.patch(
        f"/api/v1/orders/{site['order']}/lines-on-site/{line_id}",
        json={"version": order["version"], "credited_employee_id": str(people["NV005"])},
    )

    body = problem(res, 422, "VALIDATION_ERROR")
    assert error_fields(body) == ["credited_employee_id"]
    assert error_messages(body) == [SELF_CREDIT_ONLY]


@pytest.mark.ac("AC-ORD-231")
def test_stale_version_on_all_on_site_routes(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    order = add_ssd(binh, site["order"], items)
    line_id = ssd_line(order)["id"]
    stale = order["version"] - 1
    url = f"/api/v1/orders/{site['order']}/lines-on-site"

    problem(binh.post(url, json=ssd_body(stale, items)), 409, "STALE_VERSION")
    problem(binh.patch(f"{url}/{line_id}", json={"version": stale, "quantity": "2"}), 409, "STALE_VERSION")
    problem(binh.post(f"{url}/{line_id}/remove", json={"version": stale}), 409, "STALE_VERSION")


@pytest.mark.ac("AC-ORD-232")
def test_sale_can_still_recredit_technician_line_after_submit(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    order = add_ssd(client_as(app, BINH), site["order"], items)
    line_id = ssd_line(order)["id"]
    hoa = client_as(app, HOA)

    res = hoa.patch(
        f"/api/v1/orders/{site['order']}/lines-after-submit/{line_id}",
        json={"version": order["version"], "credited_employee_id": str(people["NV005"])},
    )

    assert res.status_code == 200, res.text
    assert ssd_line(res.json())["credited_employee_id"] == str(people["NV005"])
    event = next(e for e in audit_rows(db, site["order"]) if e.action == "update_line_after_submit")
    assert event.data["changes"]["credited_employee_id"] == {
        "before": str(people["NV020"]),
        "after": str(people["NV005"]),
    }


@pytest.mark.ac("AC-ORD-233")
def test_detail_flags_for_active_technician(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    insert_line(db, site["order"], items["CAM"], position=1, added_by_id=people["NV005"], added_on_site=False)
    binh = client_as(app, BINH)
    add_ssd(binh, site["order"], items)

    body = get_order(binh, site["order"])

    assert body["can_add_lines_on_site"] is True
    assert body["can_edit_lines_after_submit"] is False
    mine = ssd_line(body)
    assert mine["can_edit_on_site"] is True
    assert mine["added_on_site"] is True
    assert mine["added_by_name"] == "Nguyễn Văn Bình"
    sale = next(line for line in body["lines"] if line["name_snapshot"] == "Camera Dahua 2MP")
    assert sale["can_edit_on_site"] is False


@pytest.mark.ac("AC-ORD-234")
@pytest.mark.parametrize("setup", ["assignment_pending", "order_awaiting_confirmation"])
def test_detail_flags_false_when_not_allowed(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    items: dict[str, uuid.UUID],
    site: dict,
    setup: str,
) -> None:
    binh = client_as(app, BINH)
    add_ssd(binh, site["order"], items)
    if setup == "assignment_pending":
        set_status(db, "assignments", site["binh"], "PENDING")
    else:
        set_status(db, "orders", site["order"], "AWAITING_CONFIRMATION")

    body = get_order(binh, site["order"])

    assert body["can_add_lines_on_site"] is False
    assert body["lines"]
    assert all(line["can_edit_on_site"] is False for line in body["lines"])


@pytest.mark.ac("AC-ORD-234")
def test_detail_flags_for_sale_owner(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    body = get_order(client_as(app, HOA), site["order"])

    assert body["can_add_lines_on_site"] is False
    assert body["can_edit_lines_after_submit"] is True


@pytest.mark.ac("AC-ORD-235")
def test_sale_lines_record_added_by_and_legacy_lines_are_null(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    kh = insert_customer(
        db,
        {
            "code": "KH00042",
            "type": "COMPANY",
            "name": "Công ty TNHH An Phát",
            "contact_person": None,
            "phone": "0909000042",
            "email": None,
            "tax_code": None,
            "address": "1 Lê Duẩn",
            "note": None,
        },
        created_by=people["NV005"],
    )
    hoa = client_as(app, HOA)
    draft = hoa.post("/api/v1/orders", json={"customer_id": str(kh), "service_address": "1 Lê Duẩn"}).json()
    res = hoa.post(f"/api/v1/orders/{draft['id']}/lines", json=ssd_body(draft["version"], items))
    assert res.status_code == 201, res.text
    draft_line = res.json()["lines"][0]
    assert draft_line["added_by_id"] == str(people["NV005"])
    assert draft_line["added_on_site"] is False

    version = get_order(hoa, site["order"])["version"]
    res = hoa.post(f"/api/v1/orders/{site['order']}/lines-after-submit", json=ssd_body(version, items))
    assert res.status_code == 201, res.text
    after_submit_line = ssd_line(res.json())
    assert after_submit_line["added_by_id"] == str(people["NV005"])
    assert after_submit_line["added_on_site"] is False

    legacy = insert_line(db, site["order"], items["CAM"], position=9, added_by_id=None, added_on_site=False)
    line = next(line for line in get_order(hoa, site["order"])["lines"] if line["id"] == str(legacy))
    assert line["added_by_id"] is None
    assert line["added_on_site"] is False
    assert line["added_by_name"] is None


@pytest.mark.ac("AC-ORD-235")
def test_migration_defaults_for_existing_rows(db: Connection) -> None:
    columns = {
        row.column_name: row
        for row in db.execute(
            text(
                "SELECT column_name, is_nullable, column_default FROM information_schema.columns"
                " WHERE table_name = 'order_lines' AND column_name IN ('added_by_id', 'added_on_site')"
            )
        )
    }
    assert columns["added_by_id"].is_nullable == "YES"
    assert columns["added_on_site"].is_nullable == "NO"
    assert columns["added_on_site"].column_default == "false"


@pytest.mark.ac("AC-NTF-051")
def test_add_on_site_notifies_owner_and_tech_leads(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    add_ssd(client_as(app, BINH), site["order"], items)

    for recipient in ("NV005", "NV010"):
        rows = notifications_for(db, people[recipient], type_=NTF_TYPE)
        assert len(rows) == 1, recipient
        assert rows[0].title == "KTV thay đổi dòng hàng"
        assert rows[0].body == f"Đơn {CODE}: Nguyễn Văn Bình thêm Ổ cứng SSD Kingston 512GB \u00d7 1"
        assert rows[0].entity_type == "ORDER"
        assert rows[0].entity_id == site["order"]
    for other in ("NV020", "NV001", "NV015"):
        assert notifications_for(db, people[other], type_=NTF_TYPE) == []


@pytest.mark.ac("AC-NTF-052")
def test_update_and_remove_on_site_notify_each_time(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID], site: dict
) -> None:
    binh = client_as(app, BINH)
    order = add_ssd(binh, site["order"], items)
    line_id = ssd_line(order)["id"]
    url = f"/api/v1/orders/{site['order']}/lines-on-site/{line_id}"
    order = binh.patch(url, json={"version": order["version"], "quantity": "2"}).json()
    res = binh.post(f"{url}/remove", json={"version": order["version"]})
    assert res.status_code == 200, res.text

    for recipient in ("NV005", "NV010"):
        bodies = [row.body for row in notifications_for(db, people[recipient], type_=NTF_TYPE)]
        assert bodies[1:] == [
            f"Đơn {CODE}: Nguyễn Văn Bình sửa Ổ cứng SSD Kingston 512GB",
            f"Đơn {CODE}: Nguyễn Văn Bình xoá Ổ cứng SSD Kingston 512GB",
        ]


@pytest.mark.ac("AC-NTF-052")
def test_owner_who_is_also_tech_lead_gets_one_copy(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV010"], status="IN_PROGRESS", code=CODE)
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS", cycle=1)
    insert_assignment(db, task_id, people["NV020"], "IN_PROGRESS")

    add_ssd(client_as(app, BINH), order_id, items)

    assert len(notifications_for(db, people["NV010"], type_=NTF_TYPE)) == 1


@pytest.mark.ac("AC-CAT-098")
def test_technician_reads_catalog_without_cost_price(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    db.execute(text("UPDATE products SET cost_price = 1000000"))
    db.execute(text("UPDATE services SET cost_price = 50000"))
    urls = ("/api/v1/products", "/api/v1/services")

    binh = client_as(app, BINH)
    for url in urls:
        res = binh.get(url)
        assert res.status_code == 200, res.text
        assert res.json()["items"]
        assert all(item["cost_price"] is None for item in res.json()["items"])
    res = binh.get(f"/api/v1/products/{items['SSD-512']}")
    assert res.status_code == 200, res.text
    assert res.json()["cost_price"] is None
    res = binh.get(f"/api/v1/services/{items['DV-CAP']}")
    assert res.status_code == 200, res.text
    assert res.json()["cost_price"] is None

    hoa = client_as(app, HOA)
    for url in urls:
        assert all(item["cost_price"] is not None for item in hoa.get(url).json()["items"])
    assert hoa.get(f"/api/v1/products/{items['SSD-512']}").json()["cost_price"] == 1_000_000


@pytest.mark.ac("AC-CAT-099")
def test_technician_cannot_manage_catalog(
    app: FastAPI, people: dict[str, uuid.UUID], items: dict[str, uuid.UUID]
) -> None:
    binh = client_as(app, BINH)

    problem(
        binh.post("/api/v1/products", json={**SSD, "sku": "X-1", "cost_price": 1, "vat_rate": "8"}),
        403,
        "FORBIDDEN",
    )
    problem(
        binh.patch(f"/api/v1/services/{items['DV-CAP']}", json={"version": 1, "name": "X"}), 403, "FORBIDDEN"
    )


@pytest.mark.ac("AC-CAT-099")
def test_catalog_menu_hidden_for_technician() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    menu = json.loads((REPO_SPEC_DIR.parent / "frontend" / "src" / "app" / "menu.json").read_text("utf-8"))
    catalog = next(item for item in menu["menu"] if item["id"] == "catalog")
    assert "TECHNICIAN" not in permissions.capabilities[catalog["capability"]]
    assert "TECHNICIAN" in permissions.capabilities["catalog.read"]
