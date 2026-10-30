"""M17-02a: danh sách "Phòng ban" (AC-EMP-033…046)."""

import uuid
from typing import Any

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, Person, login, seed

HOA = Person("hoa.tran@smyou.vn", "Hoa@SmYou26", ("TECH_LEAD",), "NV010", "Trần Thị Hoa", "TECHNICAL")
BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("SALE",), "NV005", "Lê Văn Bình", "SALES")
TU = Person("tu.pham@smyou.vn", "Tu@SmYou26", ("TECHNICIAN",), "NV014", "Phạm Minh Tú", "TECHNICAL")
THU = Person("thu.do@smyou.vn", "Thu@SmYou26", ("CUSTOMER_CARE",), "NV015", "Đỗ Thu", "SALES")

URL = "/api/v1/departments"
# Fixed UUIDs seeded by the migration (M17-02b maps employees.department onto the first three).
MANAGEMENT_ID = "d1111111-1111-4111-8111-111111111111"
SALES_ID = "d2222222-2222-4222-8222-222222222222"
TECHNICAL_ID = "d3333333-3333-4333-8333-333333333333"
ECONOMIC_ID = "d4444444-4444-4444-8444-444444444444"
HR_ID = "d5555555-5555-4555-8555-555555555555"
ACCOUNTING_ID = "d6666666-6666-4666-8666-666666666666"

SEEDED = [
    "Ban quản lý",
    "Kế Toán - tài chính",
    "Kinh doanh",
    "Kỹ thuật",
    "Nhân sự/marketing",
    "Phát Triển Kinh Tế",
]


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, BINH, TU, THU)}


def problem(res: httpx.Response, status: int, code: str) -> dict[str, Any]:
    assert res.status_code == status, res.text
    body: dict[str, Any] = res.json()
    assert body["code"] == code
    return body


def audits(db: Connection, entity_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            "SELECT action, actor_id, data FROM audit_events"
            " WHERE entity_type = 'DEPARTMENT' AND entity_id = :id ORDER BY occurred_at, id"
        ),
        {"id": entity_id},
    )
    return [dict(r._mapping) for r in rows]


def count_named(db: Connection, name: str) -> int:
    return int(
        db.execute(
            text("SELECT count(*) FROM departments WHERE lower(btrim(name)) = lower(:n)"), {"n": name}
        ).scalar_one()
    )


def test_capability_declared() -> None:
    from app.main import create_app

    routes = {(m, p): c for m, p, c in declared_routes(create_app())}
    assert routes[("GET", URL)] == "employee.read"
    assert routes[("GET", URL + "/{department_id}")] == "employee.read"
    assert routes[("POST", URL)] == "employee.manage"
    assert routes[("PATCH", URL + "/{department_id}")] == "employee.manage"
    assert routes[("POST", URL + "/{department_id}/deactivate")] == "employee.manage"
    assert routes[("POST", URL + "/{department_id}/activate")] == "employee.manage"


@pytest.mark.ac("AC-EMP-033")
def test_seed_has_6_departments_sorted(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    res = client_as(app, AN).get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert [item["name"] for item in body["items"]] == SEEDED
    assert body["total"] == 6
    assert all(item["is_active"] is True and item["version"] == 1 for item in body["items"])
    assert {item["id"] for item in body["items"]} == {
        MANAGEMENT_ID,
        SALES_ID,
        TECHNICAL_ID,
        ECONOMIC_ID,
        HR_ID,
        ACCOUNTING_ID,
    }
    assert all(item["created_at"] and item["updated_at"] for item in body["items"])


@pytest.mark.ac("AC-EMP-034")
def test_create_trims_name_and_audits(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    res = client_as(app, AN).post(URL, json={"name": "  Chăm sóc khách hàng "})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Chăm sóc khách hàng"
    assert body["is_active"] is True
    assert body["version"] == 1
    events = audits(db, body["id"])
    assert [(e["action"], e["actor_id"]) for e in events] == [("create", people["NV001"])]


@pytest.mark.ac("AC-EMP-035")
def test_create_rejects_duplicate_active_name_case_insensitive(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    body = problem(client_as(app, AN).post(URL, json={"name": "kế toán - TÀI CHÍNH"}), 409, "DUPLICATE_NAME")
    assert [e["field"] for e in body["errors"]] == ["name"]
    assert count_named(db, "Kế Toán - tài chính") == 1


@pytest.mark.ac("AC-EMP-036")
def test_create_allows_name_of_inactive_department(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    assert an.post(f"{URL}/{SALES_ID}/deactivate", json={"version": 1}).status_code == 200

    res = an.post(URL, json={"name": "Kinh doanh"})
    assert res.status_code == 201, res.text
    assert res.json()["id"] != SALES_ID


@pytest.mark.ac("AC-EMP-037")
@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_create_validates_name(app: FastAPI, db: Connection, people: dict[str, uuid.UUID], name: str) -> None:
    body = problem(client_as(app, AN).post(URL, json={"name": name}), 422, "VALIDATION_ERROR")
    assert [e["field"] for e in body["errors"]] == ["name"]
    assert int(db.execute(text("SELECT count(*) FROM departments")).scalar_one()) == 6


@pytest.mark.ac("AC-EMP-038")
def test_rename_bumps_version_and_audits_old_new(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    res = client_as(app, AN).patch(f"{URL}/{HR_ID}", json={"name": "Nhân sự - Marketing", "version": 1})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Nhân sự - Marketing"
    assert body["version"] == 2
    events = audits(db, HR_ID)
    assert len(events) == 1
    assert events[0]["action"] == "rename"
    assert events[0]["actor_id"] == people["NV001"]
    assert events[0]["data"] == {"name": {"from": "Nhân sự/marketing", "to": "Nhân sự - Marketing"}}


@pytest.mark.ac("AC-EMP-039")
def test_stale_version_rejected(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    assert an.patch(f"{URL}/{HR_ID}", json={"name": "Nhân sự - Marketing", "version": 1}).status_code == 200

    problem(an.patch(f"{URL}/{HR_ID}", json={"name": "Nhân sự", "version": 1}), 409, "STALE_VERSION")
    problem(an.post(f"{URL}/{HR_ID}/deactivate", json={"version": 1}), 409, "STALE_VERSION")

    current = an.get(f"{URL}/{HR_ID}").json()
    assert current["name"] == "Nhân sự - Marketing"
    assert current["is_active"] is True
    assert current["version"] == 2


@pytest.mark.ac("AC-EMP-040")
def test_rename_to_other_active_name_conflicts(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    problem(an.patch(f"{URL}/{HR_ID}", json={"name": "kỹ thuật", "version": 1}), 409, "DUPLICATE_NAME")
    assert an.get(f"{URL}/{HR_ID}").json()["name"] == "Nhân sự/marketing"


@pytest.mark.ac("AC-EMP-041")
def test_deactivate_then_activate_with_audit(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    off = an.post(f"{URL}/{ECONOMIC_ID}/deactivate", json={"version": 1})
    assert off.status_code == 200, off.text
    assert off.json()["is_active"] is False

    on = an.post(f"{URL}/{ECONOMIC_ID}/activate", json={"version": off.json()["version"]})
    assert on.status_code == 200, on.text
    assert on.json()["is_active"] is True

    events = audits(db, ECONOMIC_ID)
    assert [(e["action"], e["actor_id"]) for e in events] == [
        ("deactivate", people["NV001"]),
        ("activate", people["NV001"]),
    ]


@pytest.mark.ac("AC-EMP-042")
def test_repeat_deactivate_or_activate_is_invalid_state(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    problem(an.post(f"{URL}/{ECONOMIC_ID}/activate", json={"version": 1}), 409, "INVALID_STATE")
    off = an.post(f"{URL}/{ECONOMIC_ID}/deactivate", json={"version": 1}).json()
    problem(
        an.post(f"{URL}/{ECONOMIC_ID}/deactivate", json={"version": off["version"]}), 409, "INVALID_STATE"
    )
    assert [e["action"] for e in audits(db, ECONOMIC_ID)] == ["deactivate"]


@pytest.mark.ac("AC-EMP-043")
def test_activate_conflicts_with_active_same_name(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    off = an.post(f"{URL}/{TECHNICAL_ID}/deactivate", json={"version": 1}).json()
    assert an.post(URL, json={"name": "KỸ THUẬT"}).status_code == 201

    problem(
        an.post(f"{URL}/{TECHNICAL_ID}/activate", json={"version": off["version"]}), 409, "DUPLICATE_NAME"
    )
    assert an.get(f"{URL}/{TECHNICAL_ID}").json()["is_active"] is False


@pytest.mark.ac("AC-EMP-044")
def test_tech_lead_reads_but_cannot_write(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    assert hoa.get(URL).status_code == 200
    assert hoa.get(f"{URL}/{HR_ID}").status_code == 200
    problem(hoa.post(URL, json={"name": "Chăm sóc khách hàng"}), 403, "FORBIDDEN")
    problem(hoa.patch(f"{URL}/{HR_ID}", json={"name": "X", "version": 1}), 403, "FORBIDDEN")
    problem(hoa.post(f"{URL}/{HR_ID}/deactivate", json={"version": 1}), 403, "FORBIDDEN")


@pytest.mark.ac("AC-EMP-044")
def test_tech_lead_cannot_activate(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    off = client_as(app, AN).post(f"{URL}/{ECONOMIC_ID}/deactivate", json={"version": 1}).json()
    problem(
        client_as(app, HOA).post(f"{URL}/{ECONOMIC_ID}/activate", json={"version": off["version"]}),
        403,
        "FORBIDDEN",
    )


@pytest.mark.ac("AC-EMP-037")
def test_create_accepts_name_of_exactly_100_chars(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    name = "Phòng " + "ữ" * 94
    res = client_as(app, AN).post(URL, json={"name": name})
    assert res.status_code == 201, res.text
    assert res.json()["name"] == name


@pytest.mark.ac("AC-EMP-039")
def test_stale_version_rejected_on_activate(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    off = an.post(f"{URL}/{ECONOMIC_ID}/deactivate", json={"version": 1}).json()
    problem(
        an.post(f"{URL}/{ECONOMIC_ID}/activate", json={"version": off["version"] - 1}), 409, "STALE_VERSION"
    )
    assert an.get(f"{URL}/{ECONOMIC_ID}").json()["is_active"] is False


def test_unknown_department_is_404(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    missing = f"{URL}/{uuid.uuid4()}"
    problem(an.get(missing), 404, "NOT_FOUND")
    problem(an.patch(missing, json={"name": "X", "version": 1}), 404, "NOT_FOUND")
    problem(an.post(f"{missing}/deactivate", json={"version": 1}), 404, "NOT_FOUND")
    problem(an.post(f"{missing}/activate", json={"version": 1}), 404, "NOT_FOUND")


@pytest.mark.ac("AC-EMP-045")
@pytest.mark.parametrize("person", [BINH, TU, THU], ids=["sale", "technician", "customer_care"])
def test_other_roles_forbidden_everywhere(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], person: Person
) -> None:
    client = client_as(app, person)
    problem(client.get(URL), 403, "FORBIDDEN")
    problem(client.get(f"{URL}/{HR_ID}"), 403, "FORBIDDEN")
    problem(client.post(URL, json={"name": "Chăm sóc khách hàng"}), 403, "FORBIDDEN")
    problem(client.patch(f"{URL}/{HR_ID}", json={"name": "X", "version": 1}), 403, "FORBIDDEN")
    problem(client.post(f"{URL}/{HR_ID}/deactivate", json={"version": 1}), 403, "FORBIDDEN")
    problem(client.post(f"{URL}/{HR_ID}/activate", json={"version": 1}), 403, "FORBIDDEN")


@pytest.mark.ac("AC-EMP-046")
def test_filter_active_and_accent_insensitive_search(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    assert an.post(f"{URL}/{SALES_ID}/deactivate", json={"version": 1}).status_code == 200

    res = an.get(URL, params={"is_active": "true", "q": "kinh"})
    assert res.status_code == 200, res.text
    assert [item["name"] for item in res.json()["items"]] == ["Phát Triển Kinh Tế"]

    unaccented = an.get(URL, params={"q": "KY THUAT"}).json()
    assert [item["name"] for item in unaccented["items"]] == ["Kỹ thuật"]
