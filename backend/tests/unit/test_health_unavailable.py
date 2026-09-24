import time
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import UNREACHABLE_DATABASE_URL


@pytest.mark.ac("AC-SYS-006")
def test_health_returns_503_problem_when_database_unreachable(make_app: Callable[..., FastAPI]) -> None:
    client = TestClient(make_app(database_url=UNREACHABLE_DATABASE_URL), raise_server_exceptions=False)

    started = time.monotonic()
    response = client.get("/api/v1/health")
    elapsed = time.monotonic() - started

    assert response.status_code == 503
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["code"] == "SERVICE_UNAVAILABLE"
    assert body["detail"] == "Không kết nối được cơ sở dữ liệu."
    assert "super-secret-pw" not in response.text
    assert "127.0.0.1" not in response.text
    assert "postgresql" not in response.text
    assert elapsed < 5
