"""Review M0-03: the client IP seen by the backend must not be forgeable via X-Forwarded-For.

Run by make smoke-prod. In production the host nginx sets `X-Real-IP $remote_addr` (DEPLOYMENT §5.1)
and is the only thing that can reach the web container, so the IP the backend trusts must come from
there — never from a caller-supplied header.
"""

import os
import uuid

import pytest

from tests.docker.stack import fetch, run

pytestmark = pytest.mark.docker

URL = os.environ.get("SMOKE_URL", "http://127.0.0.1:6890")
PROJECT = os.environ.get("SMOKE_PROJECT", "smyou-smoke")


@pytest.mark.ac("AC-SYS-022")
def test_spoofed_forwarded_for_is_not_the_client_ip() -> None:
    marker = uuid.uuid4().hex
    reply = fetch(
        f"{URL}/smyoutask/api/v1/health?probe={marker}",
        headers={"X-Forwarded-For": "10.9.9.9", "X-Real-IP": "203.0.113.7"},
    )
    assert reply.status == 200

    logs = run("docker", "compose", "-p", PROJECT, "logs", "--no-color", "backend")
    line = next((ln for ln in logs.splitlines() if marker in ln), "")
    assert line, "request not found in backend access log"
    assert "10.9.9.9" not in line, f"caller-supplied X-Forwarded-For became the client IP: {line}"
    assert "203.0.113.7" in line, f"client IP from the host nginx (X-Real-IP) not used: {line}"
