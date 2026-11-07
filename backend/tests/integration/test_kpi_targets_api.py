"""M21-01a: chỉ tiêu "Thu nhập thuần" theo nhân viên và tháng (AC-KPI-031…045)."""

import uuid
from typing import Any

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from tests.integration.conftest import AN, Person, login, seed

HOA = Person("hoa@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Trần Thị Hoa", "ECONOMIC")
TUAN = Person("tuan.le@smyou.vn", "Tuan@SmYou26", ("SALE",), "NV007", "Lê Văn Tuấn", "ECONOMIC")
NGOC = Person("ngoc.vu@smyou.vn", "Ngoc@SmYou26", ("CUSTOMER_CARE",), "NV008", "Vũ Bảo Ngọc", "ACCOUNTING")
MINH = Person("minh.pham@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV009", "Phạm Minh", "ECONOMIC")
HUNG = Person("hung.do@smyou.vn", "Hung@SmYou26", ("TECH_LEAD",), "NV010", "Đỗ Văn Hùng", "ECONOMIC")
KHANH = Person("khanh.ly@smyou.vn", "Khanh@SmYou26", ("TECHNICIAN",), "NV011", "Lý Quốc Khánh", "ECONOMIC")

URL = "/api/v1/kpi-targets"
ECONOMIC_ID = str(STANDARD_DEPARTMENT_IDS["ECONOMIC"])


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    ids = {p.code: seed(db, p) for p in (AN, HOA, TUAN, NGOC, HUNG, KHANH)}
    ids[MINH.code] = seed(db, MINH, is_active=False)
    db.execute(text("UPDATE employees SET phone = '0903123456' WHERE id = :id"), {"id": ids[HOA.code]})
    return ids


@pytest.fixture
def an(app: FastAPI, people: dict[str, uuid.UUID]) -> TestClient:
    return client_as(app, AN)


def put_target(db: Connection, employee_id: uuid.UUID, month: str, value: int, version: int = 1) -> None:
    db.execute(
        text(
            "INSERT INTO employee_kpi_targets (employee_id, month, net_revenue_target, version)"
            " VALUES (:e, :m, :v, :ver)"
        ),
        {"e": employee_id, "m": f"{month}-01", "v": value, "ver": version},
    )


def rows(client: TestClient, month: str, **params: str) -> dict[str, dict[str, Any]]:
    res = client.get(URL, params={"month": month, **params})
    assert res.status_code == 200, res.text
    return {r["employee_code"]: r for r in res.json()["items"]}


def target_of(db: Connection, employee_id: uuid.UUID, month: str) -> int | None:
    value = db.execute(
        text("SELECT net_revenue_target FROM employee_kpi_targets WHERE employee_id = :e AND month = :m"),
        {"e": employee_id, "m": f"{month}-01"},
    ).scalar_one_or_none()
    return None if value is None else int(value)


def audits(db: Connection, action: str) -> list[dict[str, Any]]:
    result = db.execute(
        text(
            "SELECT action, actor_id, data FROM audit_events"
            " WHERE entity_type = 'KPI_TARGET' AND action = :a ORDER BY occurred_at, id"
        ),
        {"a": action},
    )
    return [dict(r._mapping) for r in result]


@pytest.mark.ac("AC-KPI-031")
def test_list_month_without_targets(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed(db, Person("nv1000@smyou.vn", "Nv1000@SmYou26", ("SALE",), "NV1000", "Nhân Viên Nghìn", "ECONOMIC"))
    seed(db, Person("nv99@smyou.vn", "Nv99@SmYou26", ("SALE",), "NV99", "Nhân Viên Chín", "ECONOMIC"))
    res = an.get(URL, params={"month": "2026-11"})
    assert res.status_code == 200, res.text
    body = res.json()["items"]
    codes = [r["employee_code"] for r in body]
    assert codes == ["NV99", "NV001", "NV005", "NV007", "NV008", "NV010", "NV011", "NV1000"]
    by_code = {r["employee_code"]: r for r in body}
    for code in ("NV005", "NV007"):
        assert by_code[code]["target"] is None
        assert by_code[code]["version"] is None
        assert by_code[code]["employee_status"] == "ACTIVE"
    assert by_code["NV005"]["employee_name"] == "Trần Thị Hoa"
    assert by_code["NV005"]["department_name"] == "Phát Triển Kinh Tế"


@pytest.mark.ac("AC-KPI-032")
def test_set_target_creates_with_audit(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = people["NV005"]
    res = an.put(f"{URL}/{hoa}/2026-11", json={"net_revenue_target": 30_000_000})
    assert res.status_code == 200, res.text
    assert res.json()["target"] == 30_000_000
    assert res.json()["version"] == 1
    assert res.json()["employee_id"] == str(hoa)

    assert rows(an, "2026-11")["NV005"]["target"] == 30_000_000
    events = audits(db, "kpi_target.set")
    assert len(events) == 1
    assert events[0]["actor_id"] == people["NV001"]
    assert events[0]["data"]["month"] == "2026-11"
    assert events[0]["data"]["from"] is None
    assert events[0]["data"]["to"] == 30_000_000


@pytest.mark.ac("AC-KPI-033")
def test_edit_keeps_other_months(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = people["NV005"]
    put_target(db, hoa, "2026-10", 25_000_000)
    put_target(db, hoa, "2026-11", 30_000_000)

    res = an.put(f"{URL}/{hoa}/2026-11", json={"net_revenue_target": 35_000_000, "version": 1})
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2

    assert rows(an, "2026-10")["NV005"]["target"] == 25_000_000
    assert rows(an, "2026-11")["NV005"]["target"] == 35_000_000
    data = audits(db, "kpi_target.set")[-1]["data"]
    assert (data["from"], data["to"], data["month"]) == (30_000_000, 35_000_000, "2026-11")


@pytest.mark.ac("AC-KPI-034")
def test_stale_version(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = people["NV005"]
    put_target(db, hoa, "2026-11", 30_000_000, version=2)
    res = an.put(f"{URL}/{hoa}/2026-11", json={"net_revenue_target": 1, "version": 1})
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "STALE_VERSION"
    assert target_of(db, hoa, "2026-11") == 30_000_000


@pytest.mark.ac("AC-KPI-035")
@pytest.mark.parametrize(
    ("month", "value"),
    [
        ("2026-11", -1),
        ("2026-11", 1.5),
        ("2026-11", 10**13 + 1),
        ("2026-13", 1),
        ("2026-1", 1),
    ],
)
def test_invalid_target_or_month(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID], month: str, value: float
) -> None:
    hoa = people["NV005"]
    res = an.put(f"{URL}/{hoa}/{month}", json={"net_revenue_target": value})
    assert res.status_code == 422, res.text
    assert audits(db, "kpi_target.set") == []


@pytest.mark.ac("AC-KPI-035")
@pytest.mark.parametrize("month", ["2026-13", "2026-1", "2026-11-01", "0000-01"])
def test_invalid_month_on_list(an: TestClient, month: str) -> None:
    assert an.get(URL, params={"month": month}).status_code == 422


@pytest.mark.ac("AC-KPI-035")
def test_year_zero_rejected_on_put_and_copy(an: TestClient, people: dict[str, uuid.UUID]) -> None:
    hoa = people["NV005"]
    assert an.put(f"{URL}/{hoa}/0000-01", json={"net_revenue_target": 1}).status_code == 422
    res = an.post(f"{URL}/copy", json={"from_month": "0000-12", "to_month": "2026-11"})
    assert res.status_code == 422, res.text


@pytest.mark.ac("AC-KPI-035")
@pytest.mark.parametrize("value", [0, 10**13])
def test_boundary_targets_accepted(an: TestClient, people: dict[str, uuid.UUID], value: int) -> None:
    res = an.put(f"{URL}/{people['NV005']}/2026-11", json={"net_revenue_target": value})
    assert res.status_code == 200, res.text
    assert res.json()["target"] == value


@pytest.mark.ac("AC-KPI-034")
def test_edit_existing_without_version_is_stale(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa = people["NV005"]
    put_target(db, hoa, "2026-11", 30_000_000)
    res = an.put(f"{URL}/{hoa}/2026-11", json={"net_revenue_target": 1})
    assert res.status_code == 409, res.text
    assert target_of(db, hoa, "2026-11") == 30_000_000


@pytest.mark.ac("AC-KPI-036")
def test_delete_target(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = people["NV005"]
    put_target(db, hoa, "2026-11", 30_000_000)
    res = an.delete(f"{URL}/{hoa}/2026-11")
    assert res.status_code == 204, res.text

    assert rows(an, "2026-11")["NV005"]["target"] is None
    events = audits(db, "kpi_target.delete")
    assert len(events) == 1
    assert events[0]["data"]["from"] == 30_000_000
    assert events[0]["data"]["month"] == "2026-11"

    assert an.delete(f"{URL}/{hoa}/2026-11").status_code == 404


@pytest.fixture
def copy_source(db: Connection, people: dict[str, uuid.UUID]) -> None:
    put_target(db, people["NV005"], "2026-11", 30_000_000)
    put_target(db, people["NV007"], "2026-11", 20_000_000)
    put_target(db, people["NV007"], "2026-12", 22_000_000)


@pytest.mark.ac("AC-KPI-037")
def test_copy_keeps_existing(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID], copy_source: None
) -> None:
    res = an.post(f"{URL}/copy", json={"from_month": "2026-11", "to_month": "2027-01", "overwrite": False})
    assert res.status_code == 200, res.text
    assert res.json() == {"created": 3, "overwritten": 0, "skipped": 1}

    hoa, tuan = people["NV005"], people["NV007"]
    assert target_of(db, hoa, "2026-12") == 30_000_000
    assert target_of(db, tuan, "2026-12") == 22_000_000
    assert target_of(db, hoa, "2027-01") == 30_000_000
    assert target_of(db, tuan, "2027-01") == 20_000_000
    assert target_of(db, hoa, "2026-11") == 30_000_000

    events = audits(db, "kpi_target.copy")
    assert len(events) == 1
    data = events[0]["data"]
    assert (data["from_month"], data["to_month"], data["overwrite"]) == ("2026-11", "2027-01", False)
    assert (data["created"], data["overwritten"], data["skipped"]) == (3, 0, 1)


@pytest.mark.ac("AC-KPI-038")
def test_copy_overwrite(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID], copy_source: None
) -> None:
    res = an.post(f"{URL}/copy", json={"from_month": "2026-11", "to_month": "2027-01", "overwrite": True})
    assert res.status_code == 200, res.text
    assert res.json() == {"created": 3, "overwritten": 1, "skipped": 0}
    assert target_of(db, people["NV007"], "2026-12") == 20_000_000
    assert rows(an, "2026-12")["NV007"]["version"] == 2


@pytest.mark.ac("AC-KPI-039")
@pytest.mark.parametrize(
    ("from_month", "to_month"),
    [("2026-11", "2026-11"), ("2026-11", "2026-10"), ("2026-11", "2027-12"), ("2026-11", "2027-13")],
)
def test_copy_invalid_range(
    an: TestClient, db: Connection, copy_source: None, from_month: str, to_month: str
) -> None:
    res = an.post(f"{URL}/copy", json={"from_month": from_month, "to_month": to_month})
    assert res.status_code == 422, res.text
    assert audits(db, "kpi_target.copy") == []


@pytest.mark.ac("AC-KPI-039")
def test_copy_twelve_months_is_allowed(an: TestClient, db: Connection, copy_source: None) -> None:
    res = an.post(f"{URL}/copy", json={"from_month": "2026-11", "to_month": "2027-11"})
    assert res.status_code == 200, res.text
    assert res.json() == {"created": 23, "overwritten": 0, "skipped": 1}


@pytest.mark.ac("AC-KPI-040")
def test_copy_empty_source(an: TestClient, people: dict[str, uuid.UUID]) -> None:
    res = an.post(f"{URL}/copy", json={"from_month": "2026-11", "to_month": "2027-01"})
    assert res.status_code == 200, res.text
    assert res.json() == {"created": 0, "overwritten": 0, "skipped": 0}


@pytest.mark.ac("AC-KPI-041")
def test_filter_by_department(an: TestClient, people: dict[str, uuid.UUID]) -> None:
    by_code = rows(an, "2026-11", department_id=ECONOMIC_ID)
    assert "NV005" in by_code
    assert "NV008" not in by_code
    assert {r["department_name"] for r in by_code.values()} == {"Phát Triển Kinh Tế"}


@pytest.mark.ac("AC-KPI-042")
@pytest.mark.parametrize("q", ["hoa", "0903123", "HOA@SMYOU", "  Hoa  "])
def test_search_name_phone_email(an: TestClient, people: dict[str, uuid.UUID], q: str) -> None:
    by_code = rows(an, "2026-11", q=q)
    assert "NV005" in by_code
    assert "NV007" not in by_code
    assert by_code["NV005"]["phone"] == "0903123456"
    assert by_code["NV005"]["email"] == "hoa@smyou.vn"


@pytest.mark.ac("AC-KPI-043")
def test_inactive_only_with_target(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    put_target(db, people["NV009"], "2026-10", 10_000_000)
    october = rows(an, "2026-10")
    assert october["NV009"]["employee_status"] == "INACTIVE"
    assert october["NV009"]["target"] == 10_000_000
    assert "NV009" not in rows(an, "2026-11")


@pytest.mark.ac("AC-KPI-044")
@pytest.mark.parametrize("person", [HOA, NGOC, HUNG, KHANH], ids=lambda p: p.roles[0])
def test_other_roles_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], person: Person
) -> None:
    client = client_as(app, person)
    hoa = people["NV005"]
    put_target(db, hoa, "2026-11", 30_000_000)
    responses: list[httpx.Response] = [
        client.get(URL, params={"month": "2026-11"}),
        client.put(f"{URL}/{hoa}/2026-11", json={"net_revenue_target": 1, "version": 1}),
        client.delete(f"{URL}/{hoa}/2026-11"),
        client.post(f"{URL}/copy", json={"from_month": "2026-11", "to_month": "2026-12"}),
    ]
    for res in responses:
        assert res.status_code == 403, res.text
        assert res.json()["code"] == "FORBIDDEN"
    assert target_of(db, hoa, "2026-11") == 30_000_000
    assert target_of(db, hoa, "2026-12") is None


@pytest.mark.ac("AC-KPI-045")
def test_unknown_employee(an: TestClient, db: Connection) -> None:
    res = an.put(f"{URL}/{uuid.uuid4()}/2026-11", json={"net_revenue_target": 1})
    assert res.status_code == 404, res.text
    assert res.json()["code"] == "NOT_FOUND"
    assert an.delete(f"{URL}/{uuid.uuid4()}/2026-11").status_code == 404
    assert audits(db, "kpi_target.set") == []


# --- M21-01c: phân trang (AC-KPI-056…062) ---

HR_ID = STANDARD_DEPARTMENT_IDS["HR"]


@pytest.fixture
def forty_five(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    """NV001…NV045 all active; 12 in "Phát Triển Kinh Tế" (NV005/007/009/010/011 + NV012…NV018)."""
    db.execute(text("UPDATE employees SET is_active = true WHERE id = :id"), {"id": people[MINH.code]})
    ids = dict(people)
    for n in range(1, 46):
        code = f"NV{n:03d}"
        if code in ids:
            continue
        ids[code] = uuid.uuid4()
        db.execute(
            text(
                "INSERT INTO employees (id, code, full_name, email, username, department_id, password_hash)"
                " VALUES (:id, :code, :name, :email, :username, :dept, 'x')"
            ),
            {
                "id": ids[code],
                "code": code,
                "name": f"Nhân Viên {n}",
                "email": f"nv{n}@smyou.vn",
                "username": f"nv{n}",
                "dept": STANDARD_DEPARTMENT_IDS["ECONOMIC"] if 12 <= n <= 18 else HR_ID,
            },
        )
    return ids


def page(client: TestClient, **params: str | int) -> dict[str, Any]:
    res = client.get(URL, params=params)
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def codes(body: dict[str, Any]) -> list[str]:
    return [r["employee_code"] for r in body["items"]]


@pytest.mark.ac("AC-KPI-056")
def test_default_page(an: TestClient, forty_five: dict[str, uuid.UUID]) -> None:
    body = page(an, month="2026-11")
    assert (body["total"], body["limit"], body["offset"]) == (45, 20, 0)
    assert codes(body) == [f"NV{n:03d}" for n in range(1, 21)]


@pytest.mark.ac("AC-KPI-057")
def test_last_page(an: TestClient, forty_five: dict[str, uuid.UUID]) -> None:
    body = page(an, month="2026-11", limit=20, offset=40)
    assert (body["total"], body["limit"], body["offset"]) == (45, 20, 40)
    assert codes(body) == [f"NV{n:03d}" for n in range(41, 46)]


@pytest.mark.ac("AC-KPI-058")
def test_offset_past_total(an: TestClient, forty_five: dict[str, uuid.UUID]) -> None:
    body = page(an, month="2026-11", offset=60)
    assert body["total"] == 45
    assert body["items"] == []


@pytest.mark.ac("AC-KPI-059")
def test_total_counts_after_filters(an: TestClient, forty_five: dict[str, uuid.UUID]) -> None:
    by_department = page(an, month="2026-11", department_id=ECONOMIC_ID, limit=5)
    assert by_department["total"] == 12
    assert codes(by_department) == ["NV005", "NV007", "NV009", "NV010", "NV011"]
    by_phone = page(an, month="2026-11", q="0903123", limit=5)
    assert by_phone["total"] == 1
    assert codes(by_phone) == ["NV005"]


@pytest.mark.ac("AC-KPI-060")
def test_total_counts_leaver_only_with_target(
    an: TestClient, db: Connection, forty_five: dict[str, uuid.UUID]
) -> None:
    db.execute(text("UPDATE employees SET is_active = false WHERE id = :id"), {"id": forty_five["NV009"]})
    put_target(db, forty_five["NV009"], "2026-10", 10_000_000)
    october = page(an, month="2026-10")
    assert october["total"] == 45
    assert "NV009" in codes(october)
    november = page(an, month="2026-11")
    assert november["total"] == 44
    assert "NV009" not in codes(november)


@pytest.mark.ac("AC-KPI-061")
@pytest.mark.parametrize(
    "params",
    [{"limit": "0"}, {"limit": "101"}, {"offset": "-1"}, {"limit": "abc"}],
    ids=["limit0", "limit101", "offset-1", "limit-abc"],
)
def test_invalid_paging(an: TestClient, params: dict[str, str]) -> None:
    assert an.get(URL, params={"month": "2026-11", **params}).status_code == 422


@pytest.mark.ac("AC-KPI-061")
@pytest.mark.parametrize("limit", [1, 100])
def test_paging_limit_bounds_accepted(an: TestClient, limit: int) -> None:
    res = an.get(URL, params={"month": "2026-11", "limit": limit, "offset": 0})
    assert res.status_code == 200, res.text
    assert res.json()["limit"] == limit
    assert len(res.json()["items"]) <= limit


@pytest.mark.ac("AC-KPI-062")
@pytest.mark.parametrize("person", [HOA, NGOC, HUNG, KHANH], ids=lambda p: p.roles[0])
def test_paged_list_forbidden_for_other_roles(
    app: FastAPI, people: dict[str, uuid.UUID], person: Person
) -> None:
    res = client_as(app, person).get(URL, params={"month": "2026-11", "limit": 20, "offset": 0})
    assert res.status_code == 403, res.text
    assert res.json()["code"] == "FORBIDDEN"
