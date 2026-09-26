"""M1-04a review round 1: reproductions of the confirmed findings."""

import logging
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.modules.employees.schemas import EmployeeUpdate
from tests.integration.conftest import AN, KHOA, Person, employee_row, login, seed
from tests.integration.test_employees_api import BINH, HOA, NEW_HOA, TUAN, client_as, problem


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, BINH, HOA, TUAN, KHOA)}


@pytest.mark.ac("AC-AUTH-011")
def test_refresh_after_reset_password_is_unauthenticated_not_theft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    khoa_phone = client_as(app, KHOA)
    an = client_as(app, AN)
    assert (
        an.post(f"/api/v1/employees/{people['NV014']}/reset-password", json={"version": 1}).status_code == 200
    )
    problem(khoa_phone.post("/api/v1/auth/refresh"), 401, "UNAUTHENTICATED")


@pytest.mark.ac("AC-EMP-001")
def test_active_filter_escaping_paging_bounds_and_multiword_search(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    db.execute(text("UPDATE employees SET is_active = false WHERE code = 'NV014'"))
    an = client_as(app, AN)

    def codes(**params: str) -> list[str]:
        res = an.get("/api/v1/employees", params=params)
        assert res.status_code == 200, res.text
        return [e["code"] for e in res.json()["items"]]

    assert codes(is_active="false") == ["NV014"]
    assert codes(is_active="true") == ["NV001", "NV002", "NV005", "NV010"]
    assert codes(q="le thi") == ["NV005"]
    assert codes(q="%") == []
    assert codes(q="_") == []
    for params in ({"limit": "0"}, {"offset": "-1"}):
        problem(an.get("/api/v1/employees", params=params), 422, "VALIDATION_ERROR")
    assert "temporary_password" not in an.get("/api/v1/employees").text


@pytest.mark.ac("AC-EMP-001")
def test_codes_sort_numerically(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for code in ("NV1000", "NV101"):
        seed(db, Person(f"{code.lower()}@smyou.vn", "Xx@SmYou26", ("SALE",), code, code, "SALES"))
    an = client_as(app, AN)
    codes = [e["code"] for e in an.get("/api/v1/employees", params={"limit": "100"}).json()["items"]]
    assert codes[-2:] == ["NV101", "NV1000"]


@pytest.mark.ac("AC-EMP-004")
@pytest.mark.parametrize(
    ("change", "field", "message"),
    [
        ({"phone": "123"}, "phone", "Số điện thoại cần 10 chữ số, bắt đầu bằng 0."),
        ({"phone": "093206878712"}, "phone", "Số điện thoại cần 10 chữ số, bắt đầu bằng 0."),
        ({"email": "khong-hop-le"}, "email", "Email không hợp lệ."),
        ({"full_name": "   "}, "full_name", "Không được để trống."),
        ({"full_name": "A" * 121}, "full_name", "Tối đa 120 ký tự."),
        ({"roles": []}, "roles", "Cần chọn ít nhất một mục."),
        ({"roles": ["BOSS"]}, "roles.0", "Giá trị không hợp lệ."),
        ({"department": "HR"}, "department", "Giá trị không hợp lệ."),
    ],
)
def test_validation_messages_are_vietnamese(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    change: dict[str, object],
    field: str,
    message: str,
) -> None:
    an = client_as(app, AN)
    body = problem(an.post("/api/v1/employees", json={**NEW_HOA, **change}), 422, "VALIDATION_ERROR")
    errors = body["errors"]
    assert isinstance(errors, list)
    assert {"field": field, "message": message} in [
        {"field": e["field"], "message": e["message"]} for e in errors
    ]


@pytest.mark.ac("AC-EMP-004")
def test_duplicate_roles_are_stored_once(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    res = an.post("/api/v1/employees", json={**NEW_HOA, "roles": ["SALE", "SALE"]})
    assert res.status_code == 201, res.text
    assert res.json()["employee"]["roles"] == ["SALE"]


@pytest.mark.ac("AC-EMP-005")
def test_patch_cannot_change_state_and_other_edges(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa_id = people["NV005"]
    an = client_as(app, AN)
    body = problem(
        an.patch(
            f"/api/v1/employees/{hoa_id}", json={"version": 1, "is_active": False, "roles": ["MANAGER"]}
        ),
        422,
        "VALIDATION_ERROR",
    )
    errors = body["errors"]
    assert isinstance(errors, list)
    assert {e["field"] for e in errors} == {"is_active", "roles"}
    row = employee_row(db, hoa_id)
    assert (row["is_active"], row["version"]) == (True, 1)
    problem(
        an.patch(f"/api/v1/employees/{hoa_id}", json={"version": 1, "email": "BINH.LE@smyou.vn"}),
        409,
        "CONFLICT",
    )
    problem(
        an.patch(f"/api/v1/employees/{uuid.uuid4()}", json={"version": 1, "title": "x"}), 404, "NOT_FOUND"
    )
    problem(
        an.post(f"/api/v1/employees/{uuid.uuid4()}/reset-password", json={"version": 1}), 404, "NOT_FOUND"
    )


@pytest.mark.ac("AC-EMP-007")
def test_self_demotion_is_allowed_while_another_manager_is_active(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an_id, binh_id = people["NV001"], people["NV002"]
    an = client_as(app, AN)
    res = an.post(f"/api/v1/employees/{an_id}/roles", json={"version": 1, "roles": ["SALE"]})
    assert res.status_code == 200, res.text
    assert res.json()["roles"] == ["SALE"]

    binh = client_as(app, BINH)
    problem(
        binh.post(f"/api/v1/employees/{binh_id}/roles", json={"version": 1, "roles": ["SALE"]}),
        409,
        "LAST_MANAGER",
    )
    assert employee_row(db, binh_id)["version"] == 1  # unchanged


@pytest.mark.ac("AC-EMP-010")
def test_activate_with_a_stale_version(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    khoa_id = people["NV014"]
    an = client_as(app, AN)
    assert an.post(f"/api/v1/employees/{khoa_id}/deactivate", json={"version": 1}).status_code == 200
    problem(an.post(f"/api/v1/employees/{khoa_id}/activate", json={"version": 1}), 409, "STALE_VERSION")


@pytest.mark.ac("AC-EMP-012")
def test_every_write_command_is_logged_with_actor_and_target(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], caplog: pytest.LogCaptureFixture
) -> None:
    an_id, hoa_id = people["NV001"], people["NV005"]
    an = client_as(app, AN)
    with caplog.at_level(logging.INFO):
        assert (
            an.patch(f"/api/v1/employees/{hoa_id}", json={"version": 1, "title": "Trưởng nhóm"}).status_code
            == 200
        )
        assert (
            an.post(f"/api/v1/employees/{hoa_id}/roles", json={"version": 2, "roles": ["SALE"]}).status_code
            == 200
        )
        assert an.post(f"/api/v1/employees/{hoa_id}/deactivate", json={"version": 3}).status_code == 200
        assert an.post(f"/api/v1/employees/{hoa_id}/activate", json={"version": 4}).status_code == 200
    messages = [r.getMessage() for r in caplog.records if r.name.startswith("app.modules.employees")]
    for action in ("update", "roles", "deactivate", "activate"):
        assert any(action in m and str(an_id) in m and str(hoa_id) in m for m in messages), (action, messages)


@pytest.mark.ac("AC-EMP-012")
def test_temporary_password_responses_are_not_cached(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    created = an.post("/api/v1/employees", json=NEW_HOA)
    reset = an.post(f"/api/v1/employees/{people['NV005']}/reset-password", json={"version": 1})
    for res in (created, reset):
        assert res.headers["cache-control"] == "no-store"


@pytest.mark.ac("AC-EMP-002")
def test_new_routes_require_a_session(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    anonymous = TestClient(app, raise_server_exceptions=False)
    problem(anonymous.get("/api/v1/employees"), 401, "UNAUTHENTICATED")
    problem(anonymous.post("/api/v1/employees", json=NEW_HOA), 401, "UNAUTHENTICATED")
    assert login(anonymous, HOA.email, HOA.password).status_code == 200
    assert TUAN.code == "NV010"


@pytest.mark.ac("AC-EMP-012")
def test_write_commands_apply_the_same_scope_check_as_reads(
    db: Connection, people: dict[str, uuid.UUID], clock: object
) -> None:
    """Defense in depth: write commands must fail closed the same way reads do if `employee.manage`
    is ever given a role a narrower scope than `all` (today every holder is `all` in the YAML, so
    this is only reachable by building the Actor directly, as a future permission change would)."""
    from datetime import UTC, datetime

    from sqlalchemy.orm import Session

    from app.core.authz import Actor
    from app.core.errors import AppError
    from app.modules.employees import service

    hoa_id = people["NV005"]
    narrow_scope_actor = Actor(
        uuid.uuid4(), frozenset({"MANAGER"}), False, capability="employee.manage", scopes=("assigned",)
    )
    now = datetime(2026, 9, 26, 2, 0, tzinfo=UTC)
    with Session(bind=db) as session:
        for call in (
            lambda: service.update_employee(
                session, narrow_scope_actor, hoa_id, EmployeeUpdate(version=1, title="x"), now=now
            ),
            lambda: service.deactivate(session, narrow_scope_actor, hoa_id, version=1, now=now),
            lambda: service.activate(session, narrow_scope_actor, hoa_id, version=1, now=now),
            lambda: service.reset_password(session, narrow_scope_actor, hoa_id, version=1, now=now),
        ):
            with pytest.raises(AppError) as excinfo:
                call()
            assert excinfo.value.status == 404, excinfo.value.code
