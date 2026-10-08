"""M6-02: complete AWAITING_CONFIRMATION -> COMPLETED order (AC-ORD-125...137)."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed
from tests.integration.test_orders_confirmation_api import insert_order, insert_task_assignment, upload

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quang Tuấn", "TECHNICAL")
LONG = Person("long.dang@smyou.vn", "Long@SmYou26", ("TECHNICIAN",), "NV016", "Đặng Văn Long", "TECHNICAL")


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


def audit_rows(db: Connection, order_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action, from_status, to_status FROM audit_events"
            " WHERE entity_type='ORDER' AND entity_id=:id ORDER BY occurred_at"
        ),
        {"id": order_id},
    ).mappings()
    return [dict(r) for r in rows]


@pytest.mark.ac("AC-ORD-125")
def test_technician_completes_order(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0125"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)
    upload(khoa, order_id)
    order = khoa.get(f"/api/v1/orders/{order_id}").json()

    res = khoa.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": order["version"], "confirmation_signer_name": "Lê Thị Mai"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "COMPLETED"
    assert body["version"] == order["version"] + 1
    assert "complete" not in body["allowed_commands"]

    rows = audit_rows(db, order_id)
    assert rows[-1] == {
        "action": "complete",
        "from_status": "AWAITING_CONFIRMATION",
        "to_status": "COMPLETED",
    }

    row = db.execute(
        text("SELECT confirmation_signer_name, completed_at FROM orders WHERE id=:id"), {"id": order_id}
    ).one()
    assert row.confirmation_signer_name == "Lê Thị Mai"
    assert row.completed_at is not None


@pytest.mark.ac("AC-ORD-126")
def test_tech_lead_completes_without_assignment(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0126"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)
    upload(khoa, order_id)
    order = khoa.get(f"/api/v1/orders/{order_id}").json()

    tuan = client_as(app, TUAN)
    res = tuan.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": order["version"], "confirmation_signer_name": "Lê Thị Mai"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "COMPLETED"


@pytest.mark.ac("AC-ORD-127")
def test_unassigned_technician_gets_404(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0127"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])

    long_ = client_as(app, LONG)
    res = long_.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": 1, "confirmation_signer_name": "Lê Thị Mai"},
    )
    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-ORD-128")
def test_manager_and_sale_are_forbidden(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0128"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])

    body = {"version": 1, "confirmation_signer_name": "Lê Thị Mai"}
    an = client_as(app, AN)
    problem(an.post(f"/api/v1/orders/{order_id}/complete", json=body), 403, "FORBIDDEN")
    hoa = client_as(app, HOA)
    problem(hoa.post(f"/api/v1/orders/{order_id}/complete", json=body), 403, "FORBIDDEN")


@pytest.mark.ac("AC-ORD-129")
def test_guard_confirmation_attachment_missing(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0129"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)

    res = problem(
        khoa.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"version": 1, "confirmation_signer_name": "Lê Thị Mai"},
        ),
        409,
        "GUARD_FAILED",
    )
    assert res["guard"] == "confirmation_attachment_in_current_revision"
    assert khoa.get(f"/api/v1/orders/{order_id}").json()["status"] == "AWAITING_CONFIRMATION"


@pytest.mark.ac("AC-ORD-130")
def test_guard_confirmation_attachment_wrong_revision(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=1, code="DH2610-0130"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
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
    khoa = client_as(app, KHOA)

    res = problem(
        khoa.post(
            f"/api/v1/orders/{order_id}/complete",
            json={"version": 1, "confirmation_signer_name": "Lê Thị Mai"},
        ),
        409,
        "GUARD_FAILED",
    )
    assert res["guard"] == "confirmation_attachment_in_current_revision"


@pytest.mark.ac("AC-ORD-131")
def test_guard_signer_name_blank_and_whitespace(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0131"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)
    upload(khoa, order_id)

    empty = problem(
        khoa.post(f"/api/v1/orders/{order_id}/complete", json={"version": 1, "confirmation_signer_name": ""}),
        409,
        "GUARD_FAILED",
    )
    assert empty["guard"] == "signer_name_present"

    whitespace = problem(
        khoa.post(
            f"/api/v1/orders/{order_id}/complete", json={"version": 1, "confirmation_signer_name": "   "}
        ),
        409,
        "GUARD_FAILED",
    )
    assert whitespace["guard"] == "signer_name_present"
    assert khoa.get(f"/api/v1/orders/{order_id}").json()["status"] == "AWAITING_CONFIRMATION"


@pytest.mark.ac("AC-ORD-132")
def test_invalid_transition_from_in_progress(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2610-0132")
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": 1, "confirmation_signer_name": "Lê Thị Mai"},
    )
    problem(res, 409, "INVALID_TRANSITION")


@pytest.mark.ac("AC-ORD-133")
def test_stale_version(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0133"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)
    upload(khoa, order_id)

    res = khoa.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": 4, "confirmation_signer_name": "Lê Thị Mai"},
    )
    problem(res, 409, "STALE_VERSION")
    assert khoa.get(f"/api/v1/orders/{order_id}").json()["status"] == "AWAITING_CONFIRMATION"


@pytest.mark.ac("AC-ORD-134")
def test_invalid_transition_already_completed(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2610-0134")
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)

    res = khoa.post(
        f"/api/v1/orders/{order_id}/complete",
        json={"version": 1, "confirmation_signer_name": "Lê Thị Mai"},
    )
    problem(res, 409, "INVALID_TRANSITION")


@pytest.mark.ac("AC-ORD-135")
def test_route_declares_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if r[1] == "/api/v1/orders/{order_id}/complete"}
    assert routes == {("POST", "/api/v1/orders/{order_id}/complete", "order.complete")}


@pytest.mark.ac("AC-ORD-136")
def test_can_complete_reflects_capability_and_scope(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0136"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)
    upload(khoa, order_id)

    detail = khoa.get(f"/api/v1/orders/{order_id}").json()
    assert detail["can_complete"] is True
    assert "complete" in detail["allowed_commands"]

    hoa = client_as(app, HOA)
    assert hoa.get(f"/api/v1/orders/{order_id}").json()["can_complete"] is False


@pytest.mark.ac("AC-ORD-137")
def test_can_complete_true_even_without_attachment_yet(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0137"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    khoa = client_as(app, KHOA)

    assert khoa.get(f"/api/v1/orders/{order_id}").json()["can_complete"] is True
