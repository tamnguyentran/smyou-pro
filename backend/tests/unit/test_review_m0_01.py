"""Tests added from the M0-01 independent review (test-auditor, security-auditor, code-reviewer)."""

import logging
import uuid
from collections.abc import Callable

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.config import Settings
from app.core.db import create_db_engine
from app.core.errors import AppError

UNUSED_DATABASE_URL = "postgresql+psycopg://smyou:pw@10.255.255.1:5432/smyou"


class _Payload(BaseModel):
    quantity: int


def _probe_client(make_app: Callable[..., FastAPI], **overrides: str) -> TestClient:
    router = APIRouter(prefix="/api/v1/_probe")

    @router.post("/validate")
    def validate(payload: _Payload) -> dict[str, int]:
        return {"quantity": payload.quantity}

    @router.get("/boom")
    def boom() -> None:
        raise RuntimeError("boom")

    @router.get("/conflict")
    def conflict() -> None:
        raise AppError(409, "GUARD_FAILED", "Không thể thực hiện.", extra={"code": "HIJACK", "guard": "x"})

    app = make_app(**overrides)
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


# ---------- AC-SYS-006: timeout is configured (a blackhole host is not reliable across machines) ----------
@pytest.mark.ac("AC-SYS-006")
def test_engine_passes_connect_timeout_to_driver(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_connect(*_args: object, **kwargs: object) -> None:
        captured.update(kwargs)
        raise RuntimeError("stop before any network I/O")

    engine = create_db_engine("postgresql+psycopg://u:p@localhost:1/db", connect_timeout_seconds=7)
    monkeypatch.setattr(engine.dialect.loaded_dbapi, "connect", fake_connect)

    with pytest.raises(RuntimeError, match="stop before"):
        engine.connect()

    assert captured["connect_timeout"] == 7


@pytest.mark.ac("AC-SYS-006")
def test_database_outage_is_logged_without_credentials(
    make_app: Callable[..., FastAPI], caplog: pytest.LogCaptureFixture
) -> None:
    client = TestClient(
        make_app(database_url="postgresql+psycopg://smyou:super-secret-pw@127.0.0.1:1/smyou"),
        raise_server_exceptions=False,
    )

    with caplog.at_level(logging.WARNING):
        client.get("/api/v1/health")

    messages = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert messages, "database outage must leave a trace in the server log"
    assert all("super-secret-pw" not in r.getMessage() for r in messages)


# ---------- AC-SYS-008 ----------
@pytest.mark.ac("AC-SYS-008")
def test_validation_problem_has_vietnamese_detail(make_app: Callable[..., FastAPI]) -> None:
    response = _probe_client(make_app).post("/api/v1/_probe/validate", json={})

    assert response.json()["detail"] == "Dữ liệu không hợp lệ."


# ---------- AC-SYS-010: request id on every kind of response ----------
@pytest.mark.ac("AC-SYS-010")
def test_request_id_echoed_on_success_response(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "ok-req-1"})

    assert response.headers["x-request-id"] == "ok-req-1"


@pytest.mark.ac("AC-SYS-010")
def test_request_id_echoed_on_500(make_app: Callable[..., FastAPI]) -> None:
    response = _probe_client(make_app).get("/api/v1/_probe/boom", headers={"X-Request-ID": "abc-123"})

    assert response.status_code == 500
    assert response.headers["x-request-id"] == "abc-123"
    assert response.json()["request_id"] == "abc-123"


@pytest.mark.ac("AC-SYS-010")
@pytest.mark.parametrize(
    ("incoming", "accepted"),
    [
        ("a" * 64, True),
        ("a" * 65, False),
        ("abc 123", False),
        ("<x>", False),
        ("mã-yêu-cầu", False),
        ("a;b", False),
        ("Req_1.2-3", True),
    ],
)
def test_request_id_charset_and_length(client: TestClient, incoming: str, accepted: bool) -> None:
    response = client.get("/api/v1/khong-ton-tai", headers={"X-Request-ID": incoming.encode("utf-8")})

    returned = response.headers["x-request-id"]
    if accepted:
        assert returned == incoming
    else:
        assert returned != incoming
        assert uuid.UUID(returned)


# ---------- HTTP semantics ----------
def test_405_keeps_allow_header(client: TestClient) -> None:
    response = client.post("/api/v1/health")

    assert response.status_code == 405
    assert response.json()["code"] == "METHOD_NOT_ALLOWED"
    assert "GET" in response.headers["allow"]


def test_app_error_extra_cannot_override_reserved_fields(make_app: Callable[..., FastAPI]) -> None:
    body = _probe_client(make_app).get("/api/v1/_probe/conflict").json()

    assert body["code"] == "GUARD_FAILED"
    assert body["status"] == 409
    assert body["guard"] == "x"


# ---------- security: API description not public in production ----------
def test_openapi_document_hidden_in_production() -> None:
    from app.main import create_app

    client = TestClient(create_app(Settings(app_env="production", database_url=UNUSED_DATABASE_URL)))

    assert client.get("/api/v1/openapi.json").status_code == 404
    assert client.get("/api/docs").status_code == 404


def test_openapi_document_available_outside_production(client: TestClient) -> None:
    assert client.get("/api/v1/openapi.json").status_code == 200
