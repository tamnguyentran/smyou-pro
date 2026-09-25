"""AC-SYS-004: `make up` brings up db, backend and web healthy on the Mac (run by make e2e)."""

import json

import pytest

from tests.docker.stack import fetch, service_status

pytestmark = pytest.mark.docker


@pytest.mark.ac("AC-SYS-004")
def test_all_dev_services_healthy() -> None:
    status = service_status("smyou-dev")
    for service in ("db", "backend", "web"):
        assert service in status, f"{service} is not running: {status}"
        assert "(healthy)" in status[service], f"{service}: {status[service]}"


@pytest.mark.ac("AC-SYS-004")
def test_backend_health_on_8010() -> None:
    reply = fetch("http://127.0.0.1:8010/api/v1/health")
    assert reply.status == 200
    assert json.loads(reply.body)["database"] == "ok"


@pytest.mark.ac("AC-SYS-004")
def test_vite_serves_app_and_proxies_api() -> None:
    page = fetch("http://127.0.0.1:5183/")
    assert page.status == 200
    assert "<title>SMYou Pro</title>" in page.body

    api = fetch("http://127.0.0.1:5183/api/v1/health")
    assert api.status == 200
    assert json.loads(api.body)["status"] == "ok"
