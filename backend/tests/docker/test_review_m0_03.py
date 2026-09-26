"""Review M0-03: the client IP seen by the backend must not be forgeable via X-Forwarded-For.

Run by make smoke-prod. In production the host nginx sets `X-Real-IP $remote_addr` (DEPLOYMENT §5.1)
and is the only thing that can reach the web container, so the IP the backend trusts must come from
there — never from a caller-supplied header.
"""

import http.client
import os
import re
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


@pytest.mark.ac("AC-SYS-022")
def test_forwarded_proto_keeps_host_value_with_scheme_fallback() -> None:
    conf = run("docker", "compose", "-p", PROJECT, "exec", "-T", "web", "nginx", "-T")
    squashed = " ".join(conf.split())
    assert "map $http_x_forwarded_proto $forwarded_proto {" in squashed
    assert "default $http_x_forwarded_proto;" in squashed
    assert '"" $scheme;' in squashed
    api_block = conf[conf.index("location /smyoutask/api/") :]
    api_block = api_block[: api_block.index("}")]
    assert "proxy_set_header X-Forwarded-Proto $forwarded_proto;" in " ".join(api_block.split())


@pytest.mark.ac("AC-SYS-020")
def test_backend_process_uid_is_not_root() -> None:
    uid = run("docker", "compose", "-p", PROJECT, "exec", "-T", "backend", "id", "-u")
    assert uid.strip() != "0"


@pytest.mark.ac("AC-SYS-021")
def test_nothing_served_outside_the_base_path() -> None:
    reply = fetch(f"{URL}/")
    assert reply.status == 404
    assert "nginx" not in reply.body.lower().replace("server: nginx", "")


@pytest.mark.ac("AC-SYS-021")
def test_hashed_asset_has_a_single_cache_control_header() -> None:
    home = fetch(f"{URL}/smyoutask/")
    asset = re.search(r'src="(/smyoutask/assets/[^"]+\.js)"', home.body)
    assert asset
    conn = http.client.HTTPConnection("127.0.0.1", int(URL.rsplit(":", 1)[1]), timeout=10)
    try:
        conn.request("GET", asset.group(1))
        res = conn.getresponse()
        values = [v for k, v in res.getheaders() if k.lower() == "cache-control"]
    finally:
        conn.close()
    assert values == ["public, max-age=31536000, immutable"]
