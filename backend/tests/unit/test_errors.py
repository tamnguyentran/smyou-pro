"""Problem+json error contract and request-id propagation (no database needed)."""

import uuid
from collections.abc import Callable

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

PROBLEM_JSON = "application/problem+json"


class _Payload(BaseModel):
    quantity: int


def _app_with_probe_routes(make_app: Callable[..., FastAPI]) -> TestClient:
    router = APIRouter(prefix="/api/v1/_probe")

    @router.post("/validate")
    def validate(payload: _Payload) -> dict[str, int]:
        return {"quantity": payload.quantity}

    @router.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail xyz")

    app = make_app()
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def _assert_problem(response_json: dict[str, object], status: int, code: str) -> None:
    assert response_json["status"] == status
    assert response_json["code"] == code
    assert isinstance(response_json["title"], str)
    assert response_json["title"]
    assert isinstance(response_json["detail"], str)
    assert response_json["detail"]


@pytest.mark.ac("AC-SYS-007")
def test_unknown_route_returns_problem_404(client: TestClient) -> None:
    response = client.get("/api/v1/khong-ton-tai")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    _assert_problem(body, 404, "NOT_FOUND")
    assert body["detail"] == "Không tìm thấy tài nguyên."


@pytest.mark.ac("AC-SYS-008")
@pytest.mark.parametrize(
    ("payload", "expected_code"),
    [({}, "missing"), ({"quantity": "nhiều"}, "int_parsing")],
)
def test_validation_error_returns_problem_422_with_field_errors(
    make_app: Callable[..., FastAPI], payload: dict[str, object], expected_code: str
) -> None:
    client = _app_with_probe_routes(make_app)

    response = client.post("/api/v1/_probe/validate", json=payload)

    assert response.status_code == 422
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    _assert_problem(body, 422, "VALIDATION_ERROR")
    assert body["errors"] == [
        {"field": "quantity", "code": expected_code, "message": body["errors"][0]["message"]}
    ]
    assert body["errors"][0]["message"]


@pytest.mark.ac("AC-SYS-009")
def test_unhandled_exception_returns_problem_500_without_leaking(make_app: Callable[..., FastAPI]) -> None:
    client = _app_with_probe_routes(make_app)

    response = client.get("/api/v1/_probe/boom")

    assert response.status_code == 500
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    _assert_problem(body, 500, "INTERNAL_ERROR")
    raw = response.text
    assert "secret internal detail" not in raw
    assert "RuntimeError" not in raw
    assert "Traceback" not in raw
    assert body["request_id"] == response.headers["x-request-id"]


@pytest.mark.ac("AC-SYS-010")
def test_request_id_is_echoed_when_provided(client: TestClient) -> None:
    response = client.get("/api/v1/khong-ton-tai", headers={"X-Request-ID": "abc-123"})

    assert response.headers["x-request-id"] == "abc-123"
    assert response.json()["request_id"] == "abc-123"


@pytest.mark.ac("AC-SYS-010")
def test_request_id_is_generated_when_missing(client: TestClient) -> None:
    first = client.get("/api/v1/khong-ton-tai").headers["x-request-id"]
    second = client.get("/api/v1/khong-ton-tai").headers["x-request-id"]

    assert uuid.UUID(first)
    assert uuid.UUID(second)
    assert first != second


@pytest.mark.ac("AC-SYS-010")
def test_request_id_rejects_unsafe_values(client: TestClient) -> None:
    unsafe = "x" * 300
    response = client.get("/api/v1/khong-ton-tai", headers={"X-Request-ID": unsafe})

    assert response.headers["x-request-id"] != unsafe
    assert uuid.UUID(response.headers["x-request-id"])
