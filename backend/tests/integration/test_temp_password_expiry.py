"""M20-09: temporary password expires 24h after create / Manager reset (AC-EMP-119…122, AC-AUTH-079…085)."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import (
    AN,
    KHOA,
    FakeClock,
    FakeMailer,
    Person,
    employee_row,
    extract_reset_token,
    forgot_password,
    login,
    reset_password,
    seed,
    set_cookies,
)

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
LAN = Person("lan.vo@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV020", "Võ Thị Lan", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")
MINH = Person("minh.ng@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV016", "Nguyễn Thành Minh", "TECHNICAL")

KHOA_TEMP = "14031995"  # birth date ddmmyyyy (Q108)
ISSUED = datetime(2026, 11, 2, 1, 0, tzinfo=UTC)  # 08:00 Asia/Ho_Chi_Minh
EXPIRES = ISSUED + timedelta(hours=24)
EXPIRED_DETAIL = "Mật khẩu tạm đã hết hạn. Vui lòng liên hệ Quản lý để được cấp lại."


@pytest.fixture
def khoa_id(db: Connection, clock: FakeClock) -> uuid.UUID:
    seed(db, AN)
    employee_id = seed(db, KHOA)
    db.execute(
        text("UPDATE employees SET birth_date = :b, version = 3 WHERE id = :id"),
        {"b": date(1995, 3, 14), "id": employee_id},
    )
    clock.now = ISSUED
    return employee_id


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


def anon(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def reset_khoa(app: FastAPI, db: Connection, khoa_id: uuid.UUID) -> dict[str, object]:
    version = employee_row(db, khoa_id)["version"]
    res = client_as(app, AN).post(f"/api/v1/employees/{khoa_id}/reset-password", json={"version": version})
    assert res.status_code == 200, res.text
    body: dict[str, object] = res.json()
    return body


def parse(value: object) -> datetime:
    assert isinstance(value, str), value
    return datetime.fromisoformat(value)


def audits(db: Connection, employee_id: uuid.UUID, action: str) -> list[dict[str, object]]:
    rows = db.execute(
        text("SELECT * FROM audit_events WHERE entity_id = :id AND action = :a ORDER BY seq"),
        {"id": employee_id, "a": action},
    ).mappings()
    return [dict(r) for r in rows]


@pytest.mark.ac("AC-EMP-119")
def test_reset_password_returns_the_expiry_24_hours_ahead(
    app: FastAPI, db: Connection, khoa_id: uuid.UUID
) -> None:
    res = client_as(app, AN).post(f"/api/v1/employees/{khoa_id}/reset-password", json={"version": 3})

    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["temporary_password"] == KHOA_TEMP
    assert parse(body["temporary_password_expires_at"]) == EXPIRES
    assert body["employee"]["must_change_password"] is True
    assert parse(body["employee"]["temp_password_expires_at"]) == EXPIRES
    assert employee_row(db, khoa_id)["temp_password_expires_at"] == EXPIRES
    [event] = audits(db, khoa_id, "reset-password")
    assert KHOA_TEMP not in str(event["data"])


@pytest.mark.ac("AC-EMP-120")
def test_create_employee_returns_the_expiry_24_hours_ahead(
    app: FastAPI, db: Connection, khoa_id: uuid.UUID
) -> None:
    res = client_as(app, AN).post(
        "/api/v1/employees",
        json={
            "full_name": "Lê Thị Hoa",
            "email": "hoa.lt@smyou.vn",
            "department_id": "d2222222-2222-4222-8222-222222222222",
            "roles": ["SALE"],
        },
    )

    assert res.status_code == 201, res.text
    body = res.json()
    assert len(body["temporary_password"]) == 10
    assert parse(body["temporary_password_expires_at"]) == EXPIRES
    assert body["employee"]["must_change_password"] is True
    assert parse(body["employee"]["temp_password_expires_at"]) == EXPIRES
    assert employee_row(db, uuid.UUID(body["employee"]["id"]))["temp_password_expires_at"] == EXPIRES


@pytest.mark.ac("AC-AUTH-079")
def test_login_one_minute_before_expiry_succeeds(
    app: FastAPI, db: Connection, clock: FakeClock, khoa_id: uuid.UUID
) -> None:
    reset_khoa(app, db, khoa_id)
    clock.now = EXPIRES - timedelta(minutes=1)

    res = login(anon(app), KHOA.username, KHOA_TEMP)

    assert res.status_code == 200, res.text
    assert res.json()["must_change_password"] is True
    assert "smyou_refresh" in set_cookies(res)


@pytest.mark.ac("AC-AUTH-080")
@pytest.mark.parametrize("late", [timedelta(0), timedelta(days=3)])
def test_login_at_or_after_expiry_is_refused_without_counting_a_failure(
    app: FastAPI, db: Connection, clock: FakeClock, khoa_id: uuid.UUID, late: timedelta
) -> None:
    reset_khoa(app, db, khoa_id)
    clock.now = EXPIRES + late

    res = login(anon(app), KHOA.username, KHOA_TEMP)

    assert res.status_code == 401, res.text
    assert res.json()["code"] == "TEMP_PASSWORD_EXPIRED"
    assert res.json()["detail"] == EXPIRED_DETAIL
    assert set_cookies(res) == {}
    assert employee_row(db, khoa_id)["failed_login_count"] == 0
    [event] = audits(db, khoa_id, "login_refused")
    assert event["data"] == {"reason": "temp_password_expired"}


@pytest.mark.ac("AC-AUTH-081")
def test_wrong_password_after_expiry_is_plain_invalid_credentials(
    app: FastAPI, db: Connection, clock: FakeClock, khoa_id: uuid.UUID
) -> None:
    reset_khoa(app, db, khoa_id)
    clock.now = EXPIRES + timedelta(hours=1)

    res = login(anon(app), KHOA.username, "sai-mat-khau")

    assert res.status_code == 401, res.text
    assert res.json()["code"] == "INVALID_CREDENTIALS"
    assert employee_row(db, khoa_id)["failed_login_count"] == 1
    assert audits(db, khoa_id, "login_refused") == []


@pytest.mark.ac("AC-AUTH-082")
def test_session_opened_in_time_can_still_change_password_after_expiry(
    app: FastAPI, db: Connection, clock: FakeClock, khoa_id: uuid.UUID
) -> None:
    reset_khoa(app, db, khoa_id)
    clock.now = EXPIRES - timedelta(minutes=1)
    khoa = anon(app)
    assert login(khoa, KHOA.username, KHOA_TEMP).status_code == 200
    clock.now = EXPIRES + timedelta(hours=1)
    # The app keeps the session alive with refresh (access token lasts 15'); expiry doesn't block it (Q143).
    assert khoa.post("/api/v1/auth/refresh").status_code == 200

    res = khoa.post(
        "/api/v1/auth/change-password", json={"current_password": KHOA_TEMP, "new_password": "Khoa@SmYou9"}
    )

    assert res.status_code == 204, res.text
    row = employee_row(db, khoa_id)
    assert (row["must_change_password"], row["temp_password_expires_at"]) == (False, None)
    clock.now += timedelta(days=30)
    assert login(anon(app), KHOA.username, "Khoa@SmYou9").status_code == 200


@pytest.mark.ac("AC-AUTH-083")
def test_email_reset_clears_an_expired_temporary_password(
    app: FastAPI, db: Connection, clock: FakeClock, mailer: FakeMailer, khoa_id: uuid.UUID
) -> None:
    reset_khoa(app, db, khoa_id)
    clock.now = EXPIRES + timedelta(hours=2)
    client = anon(app)
    assert forgot_password(client, KHOA.email).status_code == 200
    token = extract_reset_token(mailer)

    res = reset_password(client, token, "Khoa@SmYou9")

    assert res.status_code == 204, res.text
    row = employee_row(db, khoa_id)
    assert (row["must_change_password"], row["temp_password_expires_at"]) == (False, None)
    assert login(anon(app), KHOA.username, "Khoa@SmYou9").status_code == 200


@pytest.mark.ac("AC-AUTH-084")
def test_pending_password_change_from_before_the_migration_never_expires(
    app: FastAPI, db: Connection, clock: FakeClock
) -> None:
    hoa_id = seed(db, HOA, must_change_password=True)
    assert employee_row(db, hoa_id)["temp_password_expires_at"] is None
    clock.now += timedelta(days=400)

    res = login(anon(app), HOA.username, HOA.password)

    assert res.status_code == 200, res.text
    assert res.json()["must_change_password"] is True


@pytest.mark.ac("AC-AUTH-085")
def test_resetting_again_after_expiry_starts_a_new_24_hours(
    app: FastAPI, db: Connection, clock: FakeClock, khoa_id: uuid.UUID
) -> None:
    reset_khoa(app, db, khoa_id)
    clock.now = EXPIRES + timedelta(hours=1)
    assert login(anon(app), KHOA.username, KHOA_TEMP).status_code == 401
    clock.now = datetime(2026, 11, 4, 3, 0, tzinfo=UTC)  # 10:00 VN

    body = reset_khoa(app, db, khoa_id)
    clock.now += timedelta(minutes=5)
    res = login(anon(app), KHOA.username, str(body["temporary_password"]))

    assert res.status_code == 200, res.text
    new_expiry = datetime(2026, 11, 5, 3, 0, tzinfo=UTC)
    assert parse(body["temporary_password_expires_at"]) == new_expiry
    assert employee_row(db, khoa_id)["temp_password_expires_at"] == new_expiry


@pytest.mark.ac("AC-EMP-121")
@pytest.mark.parametrize("person", [HOA, LAN, TUAN, MINH], ids=lambda p: p.roles[0])
def test_only_a_manager_can_reset_a_password(
    app: FastAPI, db: Connection, khoa_id: uuid.UUID, person: Person
) -> None:
    seed(db, person)

    res = client_as(app, person).post(f"/api/v1/employees/{khoa_id}/reset-password", json={"version": 3})

    assert res.status_code == 403, res.text
    assert employee_row(db, khoa_id)["temp_password_expires_at"] is None


@pytest.mark.ac("AC-EMP-122")
def test_stale_version_changes_neither_password_nor_expiry(
    app: FastAPI, db: Connection, khoa_id: uuid.UUID
) -> None:
    db.execute(text("UPDATE employees SET version = 4 WHERE id = :id"), {"id": khoa_id})
    before = employee_row(db, khoa_id)

    res = client_as(app, AN).post(f"/api/v1/employees/{khoa_id}/reset-password", json={"version": 3})

    assert res.status_code == 409, res.text
    assert res.json()["code"] == "STALE_VERSION"
    after = employee_row(db, khoa_id)
    assert after["password_hash"] == before["password_hash"]
    assert after["temp_password_expires_at"] is None
