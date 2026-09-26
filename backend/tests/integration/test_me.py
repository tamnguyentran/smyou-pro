"""M1-02: GET /api/v1/me — who am I, my roles, capability → scopes, badge counters (AC-AUTH-028…032)."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.orm import Session

from app.core.authz import Actor
from tests.integration.conftest import AN, KHOA, Person, login, seed

HA = Person("ha.pham@smyou.vn", "HaPham@2026", ("SALE", "TECHNICIAN"), "NV007", "Phạm Thu Hà", "SALES")
TUAN = Person("tuan.le@smyou.vn", "TamThoi#15", ("TECHNICIAN",), "NV015", "Lê Anh Tuấn", "TECHNICAL")

MANAGER_CAPABILITIES = {
    "catalog.read": ["all"],
    "catalog.manage": ["all"],
    "employee.read": ["all"],
    "employee.manage": ["all"],
    "profile.manage": ["self"],
    "customer.read": ["all"],
    "customer.manage": ["all"],
    "order.read": ["all"],
    "order.read_prices": ["all"],
    "order.create": ["all"],
    "order.edit_draft": ["all"],
    "order.edit_contact": ["all"],
    "order.edit_lines_after_submit": ["all"],
    "order.submit": ["all"],
    "order.cancel": ["all"],
    "order.cancel_active": ["all"],
    "task.read": ["all"],
    "dashboard.read": ["all"],
    "kpi.read": ["all"],
    "audit.read": ["all"],
    "notification.read": ["self"],
}

TECHNICIAN_CAPABILITIES = {
    "profile.manage": ["self"],
    "order.read": ["assigned"],
    "order.read_prices": ["assigned"],
    "order.upload_confirmation": ["assigned"],
    "order.complete": ["assigned"],
    "task.read": ["assigned"],
    "assignment.respond": ["self"],
    "task.upload_photo": ["assigned"],
    "dashboard.read": ["self"],
    "kpi.read": ["self"],
    "notification.read": ["self"],
}


def me_as(api: TestClient, person: Person) -> dict[str, object]:
    assert login(api, person.email, person.password).status_code == 200
    res = api.get("/api/v1/me")
    assert res.status_code == 200, res.text
    body: dict[str, object] = res.json()
    return body


@pytest.mark.ac("AC-AUTH-028")
def test_manager_sees_profile_roles_and_exactly_their_capabilities(api: TestClient, db: Connection) -> None:
    an_id = seed(db, AN)

    body = me_as(api, AN)

    assert body["employee"] == {
        "id": str(an_id),
        "code": "NV001",
        "full_name": "Nguyễn Văn An",
        "email": "an.nguyen@smyou.vn",
        "title": None,
        "department": "MANAGEMENT",
    }
    assert body["roles"] == ["MANAGER"]
    assert body["capabilities"] == MANAGER_CAPABILITIES
    assert len(MANAGER_CAPABILITIES) == 21
    assert "task.manage" not in MANAGER_CAPABILITIES
    assert "assignment.respond" not in MANAGER_CAPABILITIES
    assert body["counters"] == {}
    dumped = str(body)
    for secret in ("password_hash", "failed_login_count", "locked_until"):
        assert secret not in dumped


@pytest.mark.ac("AC-AUTH-029")
def test_technician_sees_assigned_and_self_scopes(api: TestClient, db: Connection) -> None:
    seed(db, KHOA)

    body = me_as(api, KHOA)

    assert body["roles"] == ["TECHNICIAN"]
    assert body["capabilities"] == TECHNICIAN_CAPABILITIES
    capabilities = body["capabilities"]
    assert isinstance(capabilities, dict)
    assert "order.create" not in capabilities
    assert "catalog.read" not in capabilities


@pytest.mark.ac("AC-AUTH-030")
def test_two_roles_get_the_union_and_all_wins(api: TestClient, db: Connection) -> None:
    seed(db, HA)

    body = me_as(api, HA)

    assert body["roles"] == ["SALE", "TECHNICIAN"]
    capabilities = body["capabilities"]
    assert isinstance(capabilities, dict)
    assert capabilities["order.read"] == ["all"]
    assert capabilities["dashboard.read"] == ["own", "self"]
    assert capabilities["order.submit"] == ["own"]
    assert capabilities["assignment.respond"] == ["self"]
    assert capabilities["customer.manage"] == ["all"]
    assert "task.manage" not in capabilities


@pytest.mark.ac("AC-AUTH-031")
def test_me_requires_an_active_session_and_a_changed_password(
    app: FastAPI, api: TestClient, db: Connection
) -> None:
    assert api.get("/api/v1/me").status_code == 401
    assert api.get("/api/v1/me").json()["code"] == "UNAUTHENTICATED"

    an_id = seed(db, AN)
    assert login(api, AN.email, AN.password).status_code == 200
    db.execute(text("UPDATE employees SET is_active = false WHERE id = :id"), {"id": an_id})
    disabled = api.get("/api/v1/me")
    assert disabled.status_code == 401
    assert disabled.json()["code"] == "UNAUTHENTICATED"

    tuan_client = TestClient(app, raise_server_exceptions=False)
    seed(db, TUAN, must_change_password=True)
    assert login(tuan_client, TUAN.email, TUAN.password).status_code == 200
    pending = tuan_client.get("/api/v1/me")
    assert pending.status_code == 403
    assert pending.json()["code"] == "PASSWORD_CHANGE_REQUIRED"


@pytest.mark.ac("AC-AUTH-032")
def test_counters_only_for_badges_on_menu_items_the_user_sees(app: FastAPI, db: Connection) -> None:
    seen: list[uuid.UUID] = []

    def pending_assignments(_: Session, actor: Actor) -> int:
        seen.append(actor.id)
        return 3

    app.state.counters = {"pending_assignments_count": pending_assignments}
    seed(db, AN)
    khoa_id = seed(db, KHOA)
    ha_id = seed(db, HA)

    an = me_as(TestClient(app, raise_server_exceptions=False), AN)
    khoa = me_as(TestClient(app, raise_server_exceptions=False), KHOA)
    ha = me_as(TestClient(app, raise_server_exceptions=False), HA)

    assert an["counters"] == {}
    assert khoa["counters"] == {"pending_assignments_count": 3}
    assert ha["counters"] == {"pending_assignments_count": 3}
    assert seen == [khoa_id, ha_id]
