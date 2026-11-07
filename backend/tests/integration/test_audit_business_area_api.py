"""M21-04: GET /api/v1/audit-events — `business_area` + `entity_label` on every event, and the
`business_area` filter (AC-SYS-138…141, AC-SYS-144)."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, login, seed
from tests.integration.test_audit_api import insert_event
from tests.integration.test_dashboard_api import LAN_CSK
from tests.integration.test_dispatch_api import client_as, insert_order
from tests.integration.test_orders_api import (
    HOA,
    KH00001,
    LCD,
    PC_I5,
    TUAN,
    insert_customer,
    insert_product,
    submitted_order,
)


def _events(client: TestClient, query: str = "") -> list[dict]:
    res = client.get(f"/api/v1/audit-events?limit=100{query}")
    assert res.status_code == 200, res.text
    items: list[dict] = res.json()["items"]
    return items


@pytest.mark.ac("AC-SYS-138")
def test_add_line_after_submit_event_reads_as_orders_with_order_code(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    hoa_id = seed(db, HOA)
    customer_id = insert_customer(db, KH00001, created_by=hoa_id)
    lcd = insert_product(db, LCD)
    pc = insert_product(db, PC_I5)
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=customer_id, product_id=lcd)
    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines-after-submit",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(pc),
            "quantity": "1",
            "unit_price": 11_980_000,
            "vat_rate": "0",
        },
    )
    assert res.status_code == 201, res.text

    events = _events(client_as(app, AN))

    event = next(e for e in events if e["action"] == "add_line_after_submit")
    assert event["business_area"] == "ORDERS"
    assert event["entity_label"] == order["code"]


@pytest.mark.ac("AC-SYS-139")
def test_task_create_is_tasks_and_accept_is_assignments_both_labelled_with_order_code(
    app: FastAPI, db: Connection
) -> None:
    seed(db, AN)
    hoa_id = seed(db, HOA)
    seed(db, TUAN)
    khoa_id = seed(db, KHOA)
    order_id = insert_order(db, created_by=hoa_id, status="PENDING_DISPATCH", code="DH2611-0003")
    tuan = client_as(app, TUAN)
    res = tuan.post(
        f"/api/v1/orders/{order_id}/tasks",
        json={
            "version": 1,
            "title": "Lắp 4 camera",
            "estimated_hours": "2",
            "due_at": "2026-11-05T09:00:00+07:00",
            "assignee_ids": [str(khoa_id)],
        },
    )
    assert res.status_code == 200, res.text
    assignment_id, version = db.execute(
        text(
            "SELECT a.id, o.version FROM assignments a JOIN tasks t ON t.id = a.task_id"
            " JOIN orders o ON o.id = t.order_id WHERE o.id = :id"
        ),
        {"id": order_id},
    ).one()
    res = client_as(app, KHOA).post(f"/api/v1/assignments/{assignment_id}/accept", json={"version": version})
    assert res.status_code == 200, res.text

    events = _events(client_as(app, AN))

    created = next(e for e in events if e["entity_type"] == "TASK" and e["action"] == "create")
    accepted = next(e for e in events if e["entity_type"] == "ASSIGNMENT" and e["action"] == "accept")
    assert created["business_area"] == "TASKS"
    assert accepted["business_area"] == "ASSIGNMENTS"
    assert "DH2611-0003" in created["entity_label"]
    assert "DH2611-0003" in accepted["entity_label"]
    task_code = db.execute(text("SELECT code FROM tasks WHERE order_id = :id"), {"id": order_id}).scalar_one()
    assert created["entity_label"] == task_code
    assert accepted["entity_label"] == f"{task_code} · Trần Minh Khoa (NV014)"


@pytest.mark.ac("AC-SYS-140")
def test_business_area_filter_splits_employee_events_into_auth_and_employees(
    app: FastAPI, db: Connection
) -> None:
    an = seed(db, AN)
    hoa = seed(db, HOA)
    insert_event(db, occurred_at=datetime(2026, 1, 1, tzinfo=UTC), actor_id=an, entity_id=hoa, action="roles")
    manager = client_as(app, AN)  # audits a `login` for An

    auth = _events(manager, "&business_area=AUTH")
    employees = _events(manager, "&business_area=EMPLOYEES")

    assert [e["action"] for e in auth] == ["login"]
    assert all(e["business_area"] == "AUTH" for e in auth)
    assert [e["action"] for e in employees] == ["roles"]
    assert employees[0]["business_area"] == "EMPLOYEES"
    assert employees[0]["entity_label"] == "Lê Thị Hoa (NV005)"


@pytest.mark.ac("AC-SYS-140")
def test_entity_label_is_null_when_the_entity_cannot_be_found(app: FastAPI, db: Connection) -> None:
    an = seed(db, AN)
    insert_event(
        db,
        occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
        actor_id=an,
        entity_id=uuid.uuid4(),
        entity_type="ORDER",
        action="submit",
    )

    events = _events(client_as(app, AN), "&business_area=ORDERS")

    assert len(events) == 1
    assert events[0]["entity_label"] is None


@pytest.mark.ac("AC-SYS-141")
def test_unknown_business_area_is_422(app: FastAPI, db: Connection) -> None:
    seed(db, AN)

    res = client_as(app, AN).get("/api/v1/audit-events?business_area=FOO")

    assert res.status_code == 422, res.text


@pytest.mark.ac("AC-SYS-144")
def test_non_manager_roles_still_get_403(app: FastAPI, db: Connection) -> None:
    for person in (HOA, LAN_CSK, TUAN, KHOA):
        seed(db, person)
        client = TestClient(app, raise_server_exceptions=False)
        assert login(client, person.username, person.password).status_code == 200

        res = client.get("/api/v1/audit-events?business_area=ORDERS")

        assert res.status_code == 403, f"{person.code}: {res.text}"
