"""Integration fixtures: real Postgres, one outer transaction per test (rolled back), fake clock.

The app under test gets `app.state.session_factory` bound to that transaction (SAVEPOINT per request)
and `app.state.clock` returning the fake time, so lock-outs and token expiry are tested without sleeping.
"""

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx2 as httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import Connection, create_engine, text
from sqlalchemy.orm import sessionmaker

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
ACCESS_COOKIE = "smyou_access"
REFRESH_COOKIE = "smyou_refresh"
_HASHER = PasswordHash.recommended()


@dataclass
class FakeClock:
    now: datetime = field(default_factory=lambda: datetime(2026, 9, 26, 2, 0, tzinfo=UTC))

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


@dataclass(frozen=True)
class Person:
    email: str
    password: str
    roles: tuple[str, ...]
    code: str
    full_name: str
    department: str


AN = Person("an.nguyen@smyou.vn", "SmYou@2026", ("MANAGER",), "NV001", "Nguyễn Văn An", "MANAGEMENT")
KHOA = Person("khoa.tran@smyou.vn", "TamThoi#14", ("TECHNICIAN",), "NV014", "Trần Minh Khoa", "TECHNICAL")


@pytest.fixture(scope="session")
def migrated() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(config, "head")


@pytest.fixture
def db(migrated: None) -> Iterator[Connection]:
    engine = create_engine(TEST_DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    try:
        yield connection
    finally:
        transaction.rollback()
        connection.close()
        engine.dispose()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def auth_app(make_app: Callable[..., FastAPI], db: Connection, clock: FakeClock) -> Callable[..., FastAPI]:
    def _make(**overrides: str) -> FastAPI:
        app = make_app(**overrides)
        app.state.session_factory = sessionmaker(
            bind=db, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        app.state.clock = clock
        return app

    return _make


@pytest.fixture
def app(auth_app: Callable[..., FastAPI]) -> FastAPI:
    return auth_app()


@pytest.fixture
def api(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def seed(
    db: Connection,
    person: Person,
    *,
    must_change_password: bool = False,
    is_active: bool = True,
    failed_login_count: int = 0,
) -> uuid.UUID:
    employee_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO employees (id, code, full_name, email, department, password_hash,"
            " must_change_password, is_active, failed_login_count)"
            " VALUES (:id, :code, :name, :email, :dept, :hash, :must, :active, :failed)"
        ),
        {
            "id": employee_id,
            "code": person.code,
            "name": person.full_name,
            "email": person.email,
            "dept": person.department,
            "hash": _HASHER.hash(person.password),
            "must": must_change_password,
            "active": is_active,
            "failed": failed_login_count,
        },
    )
    for role in person.roles:
        db.execute(
            text("INSERT INTO employee_roles (employee_id, role) VALUES (:id, :role)"),
            {"id": employee_id, "role": role},
        )
    return employee_id


def login(client: TestClient, email: str, password: str) -> httpx.Response:
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def set_cookies(response: httpx.Response) -> dict[str, str]:
    """cookie name → full Set-Cookie header (attributes included)."""
    return {h.split("=", 1)[0]: h for h in response.headers.get_list("set-cookie")}


def cookie_attrs(header: str) -> dict[str, str]:
    """Lower-cased attribute name → value ('' for flags) of one Set-Cookie header."""
    attrs: dict[str, str] = {}
    for part in header.split(";")[1:]:
        name, _, value = part.strip().partition("=")
        attrs[name.lower()] = value
    return attrs


def employee_row(db: Connection, employee_id: uuid.UUID) -> dict[str, object]:
    row = db.execute(text("SELECT * FROM employees WHERE id = :id"), {"id": employee_id}).mappings().one()
    return dict(row)
