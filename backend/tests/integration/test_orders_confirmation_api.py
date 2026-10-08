"""M6-01: upload/list confirmation-slip photos on an order (AC-CMP-001…011)."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes, undeclared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quang Tuấn", "TECHNICAL")
LONG = Person("long.dang@smyou.vn", "Long@SmYou26", ("TECHNICIAN",), "NV016", "Đặng Văn Long", "TECHNICAL")

JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200 + b"\xff\xd9"


def insert_order(
    db: Connection,
    *,
    created_by: uuid.UUID,
    status: str,
    revision_no: int = 0,
    code: str | None = None,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO orders (id, code, status, created_by, revision_no, service_address,"
            " work_description, priority, version)"
            " VALUES (:id, :code, :status, :created_by, :revision_no, '12 Lê Lợi, Q1',"
            " 'Lắp đặt', 'NORMAL', 1)"
        ),
        {
            "id": order_id,
            "code": code or f"DH0000-{uuid.uuid4().hex[:4]}",
            "status": status,
            "created_by": created_by,
            "revision_no": revision_no,
        },
    )
    return order_id


def insert_task_assignment(
    db: Connection, *, order_id: uuid.UUID, employee_id: uuid.UUID, created_by: uuid.UUID | None = None
) -> None:
    """Minimal rows so `order.read`/`order.upload_confirmation`'s `assigned` scope (task/assignment
    join, `orders/service.py#_assigned_clause`) sees this employee as assigned to `order_id`."""
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, created_by)"
            " VALUES (:id, :order_id, :code, 'Việc mẫu', 'INITIAL', 0, 'DONE', 2,"
            " :due_at, 'NORMAL', :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": f"CV{uuid.uuid4().hex[:6]}",
            "due_at": datetime(2026, 10, 5, 9, 0, tzinfo=UTC),
            "created_by": created_by or employee_id,
        },
    )
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, status, cycle, assigned_by)"
            " VALUES (:id, :task_id, :employee_id, 'DONE', 1, :assigned_by)"
        ),
        {
            "id": uuid.uuid4(),
            "task_id": task_id,
            "employee_id": employee_id,
            "assigned_by": created_by or employee_id,
        },
    )


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res, status: int, code: str) -> dict:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    return body


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, LONG)}


@pytest.fixture
def order_awaiting(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    """DH2610-0020 (spec example): AWAITING_CONFIRMATION, revision_no=0, Khoa assigned."""
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0020"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    return order_id


def upload(
    client: TestClient, order_id: uuid.UUID, *, filename="phieu.jpg", content=JPEG_BYTES, mime="image/jpeg"
):
    return client.post(
        f"/api/v1/orders/{order_id}/confirmation-attachments", files={"file": (filename, content, mime)}
    )


@pytest.mark.ac("AC-CMP-001")
def test_assigned_technician_uploads_confirmation_photo(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    res = upload(khoa, order_awaiting)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["revision_no"] == 0
    assert body["mime_type"] == "image/jpeg"
    assert body["size_bytes"] == len(JPEG_BYTES)
    assert body["uploaded_by"] == str(people["NV014"])
    assert "created_at" in body

    listed = khoa.get(f"/api/v1/orders/{order_awaiting}/confirmation-attachments")
    assert listed.status_code == 200, listed.text
    assert len(listed.json()["items"]) == 1


@pytest.mark.ac("AC-CMP-002")
def test_tech_lead_all_scope_uploads_without_assignment(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    upload(khoa, order_awaiting)
    tuan = client_as(app, TUAN)
    res = upload(tuan, order_awaiting, filename="phieu2.jpg")
    assert res.status_code == 201, res.text

    listed = tuan.get(f"/api/v1/orders/{order_awaiting}/confirmation-attachments")
    items = listed.json()["items"]
    assert len(items) == 2
    assert {i["revision_no"] for i in items} == {0}


@pytest.mark.ac("AC-CMP-003")
def test_unassigned_technician_gets_404(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    long_ = client_as(app, LONG)
    problem(upload(long_, order_awaiting), 404, "NOT_FOUND")


@pytest.mark.ac("AC-CMP-004")
def test_manager_and_sale_are_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    an = client_as(app, AN)
    problem(upload(an, order_awaiting), 403, "FORBIDDEN")
    hoa = client_as(app, HOA)
    problem(upload(hoa, order_awaiting), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CMP-005")
def test_rejects_bad_magic_bytes_too_large_wrong_mime(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    problem(
        upload(khoa, order_awaiting, content=b"not actually an image"),
        422,
        "INVALID_FILE_TYPE",
    )
    too_big = JPEG_BYTES[:3] + b"\x00" * (11 * 1024 * 1024)
    problem(upload(khoa, order_awaiting, filename="big.jpg", content=too_big), 422, "FILE_TOO_LARGE")
    problem(
        upload(khoa, order_awaiting, filename="a.gif", mime="image/gif"),
        422,
        "UNSUPPORTED_MEDIA_TYPE",
    )
    listed = khoa.get(f"/api/v1/orders/{order_awaiting}/confirmation-attachments")
    assert listed.json()["items"] == []


@pytest.mark.ac("AC-CMP-006")
def test_upload_during_revision_keeps_history_per_revision(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="REVISION", revision_no=1, code="DH2610-0012"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)
    # pre-existing attachment from before the revision started (revision_no=0)
    db.execute(
        text(
            "INSERT INTO attachments (id, owner_type, owner_id, kind, revision_no, storage_key,"
            " original_filename, mime_type, size_bytes, sha256, uploaded_by, created_at)"
            " VALUES (:id, 'ORDER', :order_id, 'CUSTOMER_CONFIRMATION', 0, 'x', 'old.jpg',"
            " 'image/jpeg', 10, 'abc', :uploaded_by, :created_at)"
        ),
        {
            "id": uuid.uuid4(),
            "order_id": order_id,
            "uploaded_by": people["NV014"],
            "created_at": datetime(2026, 9, 20, tzinfo=UTC),
        },
    )

    res = upload(khoa, order_id)
    assert res.status_code == 201, res.text
    assert res.json()["revision_no"] == 1

    items = khoa.get(f"/api/v1/orders/{order_id}/confirmation-attachments").json()["items"]
    assert len(items) == 2
    assert items[0]["revision_no"] == 1  # newest first
    assert {i["revision_no"] for i in items} == {0, 1}


@pytest.mark.ac("AC-CMP-007")
def test_serve_confirmation_attachment_to_order_scoped_roles(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    attachment_id = upload(khoa, order_awaiting).json()["id"]

    for person in (AN, HOA, TUAN, KHOA):
        served = client_as(app, person).get(f"/api/v1/attachments/{attachment_id}")
        assert served.status_code == 200, served.text
        assert served.headers["content-type"] == "image/jpeg"
        assert served.content == JPEG_BYTES


@pytest.mark.ac("AC-CMP-008")
def test_serve_confirmation_attachment_outside_scope_is_404(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    attachment_id = upload(khoa, order_awaiting).json()["id"]

    long_ = client_as(app, LONG)
    problem(long_.get(f"/api/v1/attachments/{attachment_id}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-CMP-009")
def test_serve_product_image_regression_forbidden_without_catalog_read(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    product_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO products (id, sku, name, category, unit, price, vat_rate, price_fixed,"
            " is_active, version) VALUES (:id, 'SKU-M6-01', 'Sản phẩm', 'PC', 'CAI', 1000000, 8,"
            " false, true, 1)"
        ),
        {"id": product_id},
    )
    attachment_id = an.post(
        f"/api/v1/products/{product_id}/image", files={"file": ("photo.jpg", JPEG_BYTES, "image/jpeg")}
    ).json()["image_attachment_id"]

    khoa = client_as(app, KHOA)
    problem(khoa.get(f"/api/v1/attachments/{attachment_id}"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CMP-010")
def test_new_routes_declare_capability_and_dynamic_route_is_tracked(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "confirmation-attachments" in r[1]}
    assert routes == {
        ("POST", "/api/v1/orders/{order_id}/confirmation-attachments", "order.upload_confirmation"),
        ("GET", "/api/v1/orders/{order_id}/confirmation-attachments", "order.read"),
    }
    permissions = app.state.specs.permissions
    assert "GET /api/v1/attachments/{attachment_id}" in permissions.dynamic_routes
    assert undeclared_routes(app, permissions) == []
    assert not any(r[1] == "/api/v1/attachments/{attachment_id}" for r in declared_routes(app))


@pytest.mark.ac("AC-CMP-011")
def test_can_upload_confirmation_reflects_capability_and_scope(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], order_awaiting: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    assert khoa.get(f"/api/v1/orders/{order_awaiting}").json()["can_upload_confirmation"] is True

    hoa = client_as(app, HOA)
    assert hoa.get(f"/api/v1/orders/{order_awaiting}").json()["can_upload_confirmation"] is False
