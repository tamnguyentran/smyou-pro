"""Production images and the prod compose stack, tried before deploying (run by make smoke-prod).

Env: SMOKE_TAG (image tag), SMOKE_URL (default http://127.0.0.1:6890), SMOKE_PROJECT (default smyou-smoke).
"""

import json
import os
import re

import pytest

from tests.docker.stack import fetch, run, service_status

pytestmark = pytest.mark.docker

TAG = os.environ.get("SMOKE_TAG", "dev")
URL = os.environ.get("SMOKE_URL", "http://127.0.0.1:6890")
PROJECT = os.environ.get("SMOKE_PROJECT", "smyou-smoke")
BACKEND = f"smyou-backend:{TAG}"
WEB = f"smyou-web:{TAG}"


def inspect(image: str) -> dict[str, object]:
    data = json.loads(run("docker", "image", "inspect", image))
    assert isinstance(data, list)
    assert data
    first = data[0]
    assert isinstance(first, dict)
    return first


@pytest.mark.ac("AC-SYS-020")
@pytest.mark.parametrize("image", [BACKEND, WEB])
def test_image_is_amd64(image: str) -> None:
    assert inspect(image)["Architecture"] == "amd64"


@pytest.mark.ac("AC-SYS-020")
def test_backend_image_is_non_root_with_healthcheck_and_no_dev_deps() -> None:
    config = inspect(BACKEND)["Config"]
    assert isinstance(config, dict)
    assert config.get("User") not in (None, "", "root", "0")
    assert config.get("Healthcheck"), "backend image has no HEALTHCHECK"
    probe = run(
        "docker",
        "run",
        "--rm",
        "--platform",
        "linux/amd64",
        "--entrypoint",
        "python",
        BACKEND,
        "-c",
        "import importlib.util as u; print(u.find_spec('pytest') is None)",
    )
    assert probe.strip() == "True", "pytest is installed in the production image"


@pytest.mark.ac("AC-SYS-021")
def test_prod_stack_healthy_and_api_through_subpath() -> None:
    status = service_status(PROJECT)
    for service in ("db", "backend", "web"):
        assert "(healthy)" in status.get(service, ""), f"{service}: {status.get(service)}"

    reply = fetch(f"{URL}/smyoutask/api/v1/health")
    assert reply.status == 200
    body = json.loads(reply.body)
    assert body["status"] == "ok"
    assert body["database"] == "ok"


@pytest.mark.ac("AC-SYS-021")
def test_spa_served_under_subpath_with_fallback_and_redirect() -> None:
    home = fetch(f"{URL}/smyoutask/")
    assert home.status == 200
    assert "/smyoutask/assets/" in home.body
    assert "no-cache" in home.headers.get("cache-control", "")

    deep = fetch(f"{URL}/smyoutask/don-hang/123")
    assert deep.status == 200
    assert deep.body == home.body

    bare = fetch(f"{URL}/smyoutask")
    assert bare.status == 301
    assert bare.headers["location"].endswith("/smyoutask/")


@pytest.mark.ac("AC-SYS-021")
def test_hashed_assets_cached_immutable() -> None:
    home = fetch(f"{URL}/smyoutask/")
    match = re.search(r'src="(/smyoutask/assets/[^"]+\.js)"', home.body)
    assert match, "no hashed script in index.html"
    asset = fetch(f"{URL}{match.group(1)}")
    assert asset.status == 200
    assert "immutable" in asset.headers.get("cache-control", "")


@pytest.mark.ac("AC-SYS-021")
def test_production_hardening() -> None:
    assert fetch(f"{URL}/smyoutask/api/v1/openapi.json").status == 404
    home = fetch(f"{URL}/smyoutask/")
    assert home.headers.get("x-content-type-options") == "nosniff"
    assert re.search(r"\d", home.headers.get("server", "")) is None, "nginx version is exposed"


@pytest.mark.ac("AC-SYS-022")
def test_backend_trusts_proxy_headers() -> None:
    config = inspect(BACKEND)["Config"]
    assert isinstance(config, dict)
    command = " ".join((config.get("Entrypoint") or []) + (config.get("Cmd") or []))
    assert "--proxy-headers" in command
    assert "--forwarded-allow-ips" in command


@pytest.mark.ac("AC-SYS-022")
def test_web_forwards_proto_and_client_ip_to_backend() -> None:
    conf = run("docker", "compose", "-p", PROJECT, "exec", "-T", "web", "nginx", "-T")
    api_block = conf[conf.index("location /smyoutask/api/") :]
    api_block = api_block[: api_block.index("}")]
    assert "proxy_set_header X-Forwarded-Proto" in api_block
    assert "proxy_set_header X-Forwarded-For" in api_block
