"""M6-03a: chuyển đơn COMPLETED/AWAITING_CONFIRMATION -> REVISION (AC-ORD-144…151)."""

import uuid

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, Person, seed
from tests.integration.test_orders_complete_api import HOA, LONG, TUAN, client_as, problem
from tests.integration.test_orders_confirmation_api import insert_order, insert_task_assignment

KHOA = Person("khoa.tran@smyou.vn", "TamThoi#14", ("TECHNICIAN",), "NV014", "Trần Minh Khoa", "TECHNICAL")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, LONG)}


def audit_rows(db: Connection, order_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action, from_status, to_status, data, actor_id FROM audit_events"
            " WHERE entity_type='ORDER' AND entity_id=:id ORDER BY occurred_at"
        ),
        {"id": order_id},
    ).mappings()
    return [dict(r) for r in rows]


@pytest.mark.ac("AC-ORD-144")
def test_revise_from_completed(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="COMPLETED", revision_no=0, code="DH2610-0144"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    res = tuan.post(
        f"/api/v1/orders/{order_id}/revise",
        json={"version": order["version"], "reason": "Camera tầng 2 lắp sai vị trí, khách yêu cầu chỉnh lại"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "REVISION"
    assert body["revision_no"] == 1
    assert body["version"] == order["version"] + 1
    assert "request_revision" not in body["allowed_commands"]
    assert "complete" not in body["allowed_commands"]

    row = (
        db.execute(
            text("SELECT revision_no, reason, requested_by FROM order_revisions WHERE order_id=:id"),
            {"id": order_id},
        )
        .mappings()
        .one()
    )
    assert row["revision_no"] == 1
    assert row["requested_by"] == people["NV010"]

    rows = audit_rows(db, order_id)
    assert rows[-1]["action"] == "request_revision"
    assert rows[-1]["from_status"] == "COMPLETED"
    assert rows[-1]["to_status"] == "REVISION"


@pytest.mark.ac("AC-ORD-145")
def test_revise_from_awaiting_confirmation(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0145"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    tuan = client_as(app, TUAN)
    order = tuan.get(f"/api/v1/orders/{order_id}").json()

    res = tuan.post(
        f"/api/v1/orders/{order_id}/revise",
        json={"version": order["version"], "reason": "Thiếu 1 đầu ghi theo hợp đồng"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "REVISION"
    assert res.json()["revision_no"] == 1

    rows = audit_rows(db, order_id)
    assert rows[-1]["from_status"] == "AWAITING_CONFIRMATION"
    assert rows[-1]["to_status"] == "REVISION"


@pytest.mark.ac("AC-ORD-146")
def test_revise_forbidden_for_non_tech_lead(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0146"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    body = {"version": 1, "reason": "Lý do hợp lệ đủ dài"}

    for person in (KHOA, LONG, HOA, AN):
        client = client_as(app, person)
        problem(client.post(f"/api/v1/orders/{order_id}/revise", json=body), 403, "FORBIDDEN")


@pytest.mark.ac("AC-ORD-147")
def test_revise_guard_reason_present(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0147"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    tuan = client_as(app, TUAN)

    for reason in ("", "   ", "lỗi"):
        res = problem(
            tuan.post(f"/api/v1/orders/{order_id}/revise", json={"version": 1, "reason": reason}),
            409,
            "GUARD_FAILED",
        )
        assert res["guard"] == "reason_present"
    assert tuan.get(f"/api/v1/orders/{order_id}").json()["status"] == "AWAITING_CONFIRMATION"


@pytest.mark.ac("AC-ORD-148")
def test_revise_invalid_transition(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    for i, status in enumerate(("IN_PROGRESS", "PENDING_DISPATCH", "DRAFT", "REVISION")):
        order_id = insert_order(
            db, created_by=people["NV001"], status=status, revision_no=0, code=f"DH2610-100{i}"
        )
        res = tuan.post(
            f"/api/v1/orders/{order_id}/revise",
            json={"version": 1, "reason": "Lý do hợp lệ đủ dài"},
        )
        problem(res, 409, "INVALID_TRANSITION")
        assert tuan.get(f"/api/v1/orders/{order_id}").json()["status"] == status


@pytest.mark.ac("AC-ORD-149")
def test_revise_stale_version(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0149"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    tuan = client_as(app, TUAN)

    res = tuan.post(
        f"/api/v1/orders/{order_id}/revise",
        json={"version": 99, "reason": "Lý do hợp lệ đủ dài"},
    )
    problem(res, 409, "STALE_VERSION")


@pytest.mark.ac("AC-ORD-150")
def test_route_declares_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if r[1] == "/api/v1/orders/{order_id}/revise"}
    assert routes == {("POST", "/api/v1/orders/{order_id}/revise", "order.revise")}


@pytest.mark.ac("AC-ORD-151")
def test_can_revise_flag(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="AWAITING_CONFIRMATION", revision_no=0, code="DH2610-0151"
    )
    insert_task_assignment(db, order_id=order_id, employee_id=people["NV014"])
    tuan = client_as(app, TUAN)
    assert tuan.get(f"/api/v1/orders/{order_id}").json()["can_revise"] is True

    hoa = client_as(app, HOA)
    assert hoa.get(f"/api/v1/orders/{order_id}").json()["can_revise"] is False
    an = client_as(app, AN)
    assert an.get(f"/api/v1/orders/{order_id}").json()["can_revise"] is False

    order_id_2 = insert_order(
        db, created_by=people["NV001"], status="IN_PROGRESS", revision_no=0, code="DH2610-0152"
    )
    insert_task_assignment(db, order_id=order_id_2, employee_id=people["NV014"])
    assert tuan.get(f"/api/v1/orders/{order_id_2}").json()["can_revise"] is False
