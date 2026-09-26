"""M1-04a: employee management API (AC-EMP-001…007, 009…012)."""

import logging
import uuid
from datetime import timedelta

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, FakeClock, Person, employee_row, login, seed

BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("MANAGER",), "NV002", "Lê Văn Bình", "MANAGEMENT")
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")

ITEM_KEYS = {
    "id",
    "code",
    "full_name",
    "email",
    "phone",
    "department",
    "title",
    "roles",
    "is_active",
    "is_locked",
    "must_change_password",
    "version",
}
NEW_HOA = {
    "full_name": "Trần Thị Mai",
    "email": "mai.tran@smyou.vn",
    "phone": "0932 06 8787",
    "department": "SALES",
    "title": "Nhân viên kinh doanh",
    "roles": ["SALE"],
}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, BINH, HOA, TUAN, KHOA)}


def client_as(app: FastAPI, person: Person, password: str | None = None) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, password or person.password)
    assert res.status_code == 200, res.text
    return client


def version_of(db: Connection, employee_id: uuid.UUID) -> int:
    version = employee_row(db, employee_id)["version"]
    assert isinstance(version, int)
    return version


def problem(res: httpx.Response, status: int, code: str) -> dict[str, object]:
    assert res.status_code == status, res.text
    body: dict[str, object] = res.json()
    assert body["code"] == code
    return body


@pytest.mark.ac("AC-EMP-001")
def test_list_search_filter_and_page(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    db.execute(text("UPDATE employees SET is_active = false WHERE code = 'NV014'"))
    db.execute(
        text("UPDATE employees SET locked_until = :t WHERE code = 'NV005'"),
        {"t": clock.now + timedelta(minutes=10)},
    )
    db.execute(text("UPDATE employees SET phone = '0987654321' WHERE code = 'NV010'"))
    an = client_as(app, AN)

    res = an.get("/api/v1/employees", params={"q": "kho", "is_active": "false", "role": "TECHNICIAN"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["total"], body["limit"], body["offset"]) == (1, 20, 0)
    (khoa,) = body["items"]
    assert set(khoa) == ITEM_KEYS
    assert (khoa["code"], khoa["is_active"], khoa["roles"]) == ("NV014", False, ["TECHNICIAN"])

    everyone = an.get("/api/v1/employees").json()
    assert [e["code"] for e in everyone["items"]] == ["NV001", "NV002", "NV005", "NV010", "NV014"]
    assert next(e for e in everyone["items"] if e["code"] == "NV005")["is_locked"] is True
    assert "password_hash" not in str(everyone)
    assert "failed_login_count" not in str(everyone)

    def codes(**params: str) -> list[str]:
        return [e["code"] for e in an.get("/api/v1/employees", params=params).json()["items"]]

    assert codes(q="tuan") == ["NV010"]  # no diacritics needed
    assert codes(q="TUẤN") == ["NV010"]
    assert codes(q="NV01") == ["NV010", "NV014"]
    assert codes(q="binh.le@") == ["NV002"]
    assert codes(q="0987654") == ["NV010"]
    assert codes(role="MANAGER") == ["NV001", "NV002"]
    page = an.get("/api/v1/employees", params={"limit": "2", "offset": "2"}).json()
    assert (page["total"], [e["code"] for e in page["items"]]) == (5, ["NV005", "NV010"])
    assert an.get("/api/v1/employees", params={"limit": "101"}).status_code == 422
    assert an.get("/api/v1/employees", params={"role": "BOSS"}).status_code == 422


@pytest.mark.ac("AC-EMP-002")
def test_tech_lead_reads_only_and_others_are_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa_id = people["NV005"]
    tuan = client_as(app, TUAN)
    assert tuan.get("/api/v1/employees").status_code == 200
    detail = tuan.get(f"/api/v1/employees/{hoa_id}")
    assert detail.status_code == 200
    assert set(detail.json()) == ITEM_KEYS
    writes = [
        tuan.post("/api/v1/employees", json=NEW_HOA),
        tuan.patch(f"/api/v1/employees/{hoa_id}", json={"version": 1, "title": "x"}),
        tuan.post(f"/api/v1/employees/{hoa_id}/roles", json={"version": 1, "roles": ["SALE"]}),
        tuan.post(f"/api/v1/employees/{hoa_id}/deactivate", json={"version": 1}),
        tuan.post(f"/api/v1/employees/{hoa_id}/activate", json={"version": 1}),
        tuan.post(f"/api/v1/employees/{hoa_id}/reset-password", json={"version": 1}),
    ]
    for res in writes:
        problem(res, 403, "FORBIDDEN")

    for person in (HOA, KHOA):
        other = client_as(app, person)
        problem(other.get("/api/v1/employees"), 403, "FORBIDDEN")
        problem(other.get(f"/api/v1/employees/{hoa_id}"), 403, "FORBIDDEN")

    an = client_as(app, AN)
    problem(an.get(f"/api/v1/employees/{uuid.uuid4()}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-EMP-003")
def test_create_generates_code_and_one_time_temporary_password(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)

    res = an.post("/api/v1/employees", json=NEW_HOA)

    assert res.status_code == 201, res.text
    body = res.json()
    temp = body["temporary_password"]
    assert isinstance(temp, str)
    assert len(temp) == 10
    employee = body["employee"]
    assert employee["code"] == "NV015"  # after the largest existing code (NV014)
    assert employee["phone"] == "0932068787"
    assert employee["must_change_password"] is True
    assert employee["roles"] == ["SALE"]
    assert "temporary_password" not in an.get(f"/api/v1/employees/{employee['id']}").json()

    second = an.post("/api/v1/employees", json={**NEW_HOA, "email": "lan.vo@smyou.vn"})
    assert second.json()["employee"]["code"] == "NV016"

    mai = TestClient(app, raise_server_exceptions=False)
    first_login = login(mai, "mai.tran@smyou.vn", temp)
    assert first_login.status_code == 200
    assert first_login.json()["must_change_password"] is True
    problem(mai.get("/api/v1/me"), 403, "PASSWORD_CHANGE_REQUIRED")


@pytest.mark.ac("AC-EMP-004")
@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"email": "khong-hop-le"}, "email"),
        ({"phone": "123"}, "phone"),
        ({"phone": "1932068787"}, "phone"),
        ({"roles": []}, "roles"),
        ({"roles": ["BOSS"]}, "roles.0"),
        ({"full_name": "   "}, "full_name"),
        ({"department": "HR"}, "department"),
    ],
)
def test_create_validation(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], change: dict[str, object], field: str
) -> None:
    an = client_as(app, AN)
    body = problem(an.post("/api/v1/employees", json={**NEW_HOA, **change}), 422, "VALIDATION_ERROR")
    errors = body["errors"]
    assert isinstance(errors, list)
    assert field in [e["field"] for e in errors]


@pytest.mark.ac("AC-EMP-004")
def test_create_with_a_used_email_is_a_conflict(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    body = problem(
        an.post("/api/v1/employees", json={**NEW_HOA, "email": "HOA.LE@smyou.vn"}), 409, "CONFLICT"
    )
    assert body["errors"] == [
        {"field": "email", "code": "taken", "message": "Email đã được dùng cho nhân viên khác."}
    ]
    assert body["detail"] == "Email đã được dùng cho nhân viên khác."


@pytest.mark.ac("AC-EMP-005")
def test_edit_details_with_optimistic_version(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa_id = people["NV005"]
    an = client_as(app, AN)

    res = an.patch(
        f"/api/v1/employees/{hoa_id}",
        json={"version": 1, "full_name": "Lê Thị Hoa (KD)", "phone": "0901234567", "title": "Trưởng nhóm"},
    )
    assert res.status_code == 200, res.text
    assert (res.json()["version"], res.json()["full_name"]) == (2, "Lê Thị Hoa (KD)")

    stale = an.patch(f"/api/v1/employees/{hoa_id}", json={"version": 1, "title": "Cũ"})
    problem(stale, 409, "STALE_VERSION")
    taken = an.patch(f"/api/v1/employees/{hoa_id}", json={"version": 2, "email": "binh.le@smyou.vn"})
    problem(taken, 409, "CONFLICT")
    for path, payload in (
        ("roles", {"version": 1, "roles": ["SALE"]}),
        ("deactivate", {"version": 1}),
        ("reset-password", {"version": 1}),
    ):
        problem(an.post(f"/api/v1/employees/{hoa_id}/{path}", json=payload), 409, "STALE_VERSION")
    assert employee_row(db, hoa_id)["title"] == "Trưởng nhóm"


@pytest.mark.ac("AC-EMP-006")
def test_set_roles_takes_effect_on_the_next_request(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa_id = people["NV005"]
    hoa = client_as(app, HOA)
    assert "assignment.respond" not in hoa.get("/api/v1/me").json()["capabilities"]
    an = client_as(app, AN)

    res = an.post(f"/api/v1/employees/{hoa_id}/roles", json={"version": 1, "roles": ["TECHNICIAN", "SALE"]})

    assert res.status_code == 200, res.text
    assert res.json()["roles"] == ["SALE", "TECHNICIAN"]
    assert res.json()["version"] == 2
    assert "assignment.respond" in hoa.get("/api/v1/me").json()["capabilities"]
    body = problem(
        an.post(f"/api/v1/employees/{hoa_id}/roles", json={"version": 2, "roles": []}),
        422,
        "VALIDATION_ERROR",
    )
    assert body["errors"]


@pytest.mark.ac("AC-EMP-007")
def test_the_last_active_manager_cannot_lose_the_role(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an_id, binh_id = people["NV001"], people["NV002"]
    an = client_as(app, AN)

    res = an.post(f"/api/v1/employees/{binh_id}/roles", json={"version": 1, "roles": ["SALE"]})
    assert res.status_code == 200, res.text

    body = problem(
        an.post(f"/api/v1/employees/{an_id}/roles", json={"version": 1, "roles": ["SALE"]}),
        409,
        "LAST_MANAGER",
    )
    assert body["detail"] == "Phải còn ít nhất một Quản lý chung đang hoạt động."
    assert an.get("/api/v1/me").json()["roles"] == ["MANAGER"]


@pytest.mark.ac("AC-EMP-007")
def test_an_inactive_manager_does_not_count(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an_id = people["NV001"]
    db.execute(text("UPDATE employees SET is_active = false WHERE code = 'NV002'"))
    an = client_as(app, AN)
    ok = an.post(f"/api/v1/employees/{an_id}/roles", json={"version": 1, "roles": ["MANAGER", "SALE"]})
    assert ok.status_code == 200  # keeping MANAGER is fine
    problem(
        an.post(f"/api/v1/employees/{an_id}/roles", json={"version": 2, "roles": ["SALE"]}),
        409,
        "LAST_MANAGER",
    )


@pytest.mark.ac("AC-EMP-009")
def test_deactivate_signs_the_employee_out_everywhere(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an_id, khoa_id = people["NV001"], people["NV014"]
    khoa_phone = client_as(app, KHOA)
    assert khoa_phone.get("/api/v1/me").status_code == 200
    an = client_as(app, AN)

    res = an.post(f"/api/v1/employees/{khoa_id}/deactivate", json={"version": 1})

    assert res.status_code == 200, res.text
    assert (res.json()["is_active"], res.json()["version"]) == (False, 2)
    problem(khoa_phone.get("/api/v1/me"), 401, "UNAUTHENTICATED")
    problem(khoa_phone.post("/api/v1/auth/refresh"), 401, "UNAUTHENTICATED")
    revoked = db.execute(
        text("SELECT count(*) FROM auth_sessions WHERE employee_id = :id AND revoked_at IS NULL"),
        {"id": khoa_id},
    ).scalar_one()
    assert revoked == 0
    fresh = TestClient(app, raise_server_exceptions=False)
    problem(login(fresh, KHOA.email, KHOA.password), 403, "ACCOUNT_DISABLED")

    body = problem(
        an.post(f"/api/v1/employees/{an_id}/deactivate", json={"version": 1}), 409, "CANNOT_DEACTIVATE_SELF"
    )
    assert body["detail"] == "Bạn không thể tự khoá tài khoản của mình."


@pytest.mark.ac("AC-EMP-010")
def test_activate_and_invalid_transitions(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    khoa_id = people["NV014"]
    an = client_as(app, AN)
    problem(an.post(f"/api/v1/employees/{khoa_id}/activate", json={"version": 1}), 409, "INVALID_TRANSITION")
    assert an.post(f"/api/v1/employees/{khoa_id}/deactivate", json={"version": 1}).status_code == 200
    problem(
        an.post(f"/api/v1/employees/{khoa_id}/deactivate", json={"version": 2}), 409, "INVALID_TRANSITION"
    )

    res = an.post(f"/api/v1/employees/{khoa_id}/activate", json={"version": 2})

    assert res.status_code == 200, res.text
    assert (res.json()["is_active"], res.json()["version"]) == (True, 3)
    client_as(app, KHOA)  # old password works again


@pytest.mark.ac("AC-EMP-011")
def test_reset_password_clears_the_lockout_and_ends_sessions(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], clock: FakeClock
) -> None:
    khoa_id = people["NV014"]
    khoa_phone = client_as(app, KHOA)
    db.execute(
        text("UPDATE employees SET failed_login_count = 3, locked_until = :t WHERE id = :id"),
        {"t": clock.now + timedelta(minutes=15), "id": khoa_id},
    )
    an = client_as(app, AN)

    res = an.post(f"/api/v1/employees/{khoa_id}/reset-password", json={"version": 1})

    assert res.status_code == 200, res.text
    temp = res.json()["temporary_password"]
    assert res.json()["employee"]["must_change_password"] is True
    assert res.json()["employee"]["is_locked"] is False
    row = employee_row(db, khoa_id)
    assert (row["failed_login_count"], row["locked_until"], row["must_change_password"]) == (0, None, True)
    problem(khoa_phone.get("/api/v1/me"), 401, "UNAUTHENTICATED")
    problem(
        login(TestClient(app, raise_server_exceptions=False), KHOA.email, KHOA.password),
        401,
        "INVALID_CREDENTIALS",
    )
    again = login(TestClient(app, raise_server_exceptions=False), KHOA.email, temp)
    assert again.status_code == 200
    assert again.json()["must_change_password"] is True


@pytest.mark.ac("AC-EMP-012")
def test_routes_capabilities_and_logs(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], caplog: pytest.LogCaptureFixture
) -> None:
    employee_routes = {r for r in declared_routes(app) if "/employees" in r[1]}
    assert employee_routes == {
        ("GET", "/api/v1/employees", "employee.read"),
        ("GET", "/api/v1/employees/{employee_id}", "employee.read"),
        ("POST", "/api/v1/employees", "employee.manage"),
        ("PATCH", "/api/v1/employees/{employee_id}", "employee.manage"),
        ("POST", "/api/v1/employees/{employee_id}/roles", "employee.manage"),
        ("POST", "/api/v1/employees/{employee_id}/deactivate", "employee.manage"),
        ("POST", "/api/v1/employees/{employee_id}/activate", "employee.manage"),
        ("POST", "/api/v1/employees/{employee_id}/reset-password", "employee.manage"),
    }
    an_id, hoa_id = people["NV001"], people["NV005"]
    an = client_as(app, AN)
    with caplog.at_level(logging.INFO):
        created = an.post("/api/v1/employees", json=NEW_HOA).json()
        reset = an.post(f"/api/v1/employees/{hoa_id}/reset-password", json={"version": 1}).json()
    for temp in (created["temporary_password"], reset["temporary_password"]):
        assert temp not in caplog.text
    messages = [r.getMessage() for r in caplog.records if r.name.startswith("app.modules.employees")]
    assert any("create" in m and str(an_id) in m and created["employee"]["id"] in m for m in messages), (
        messages
    )
    assert any("reset-password" in m and str(an_id) in m and str(hoa_id) in m for m in messages), messages
