"""Static checks of the two compose files (M0-03, DEPLOYMENT §2)."""

from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]


def load(name: str) -> dict[str, Any]:
    path = ROOT / name
    assert path.is_file(), f"{name} is missing"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def services(name: str) -> dict[str, dict[str, Any]]:
    svcs = load(name)["services"]
    assert isinstance(svcs, dict)
    return svcs


def dockerfile_has_healthcheck(context: str) -> bool:
    dockerfile = ROOT / context / "Dockerfile"
    return dockerfile.is_file() and "HEALTHCHECK" in dockerfile.read_text(encoding="utf-8")


@pytest.mark.ac("AC-SYS-019")
def test_prod_compose_uses_images_only_and_hardcodes_production() -> None:
    svcs = services("compose.prod.yml")
    assert set(svcs) == {"db", "backend", "web"}
    for name, svc in svcs.items():
        assert "build" not in svc, f"{name} must not build on the server"
        assert "image" in svc
    assert svcs["backend"]["image"].startswith("smyou-backend:${IMAGE_TAG")
    assert svcs["web"]["image"].startswith("smyou-web:${IMAGE_TAG")
    assert svcs["backend"]["environment"]["APP_ENV"] == "production"


@pytest.mark.ac("AC-SYS-019")
def test_prod_compose_exposes_only_web_on_localhost() -> None:
    svcs = services("compose.prod.yml")
    assert "ports" not in svcs["db"]
    assert "ports" not in svcs["backend"]
    assert svcs["web"]["ports"] == ["${WEB_BIND:-127.0.0.1}:${WEB_PORT:-6890}:80"]


@pytest.mark.ac("AC-SYS-019")
def test_prod_compose_restart_logging_and_volumes() -> None:
    data = load("compose.prod.yml")
    for name, svc in data["services"].items():
        assert svc.get("restart") == "unless-stopped", name
        logging = svc.get("logging", {})
        assert logging.get("driver") == "json-file", name
        assert "max-size" in logging.get("options", {}), name
    assert {"pgdata", "uploads"} <= set(data["volumes"])


@pytest.mark.ac("AC-SYS-019")
@pytest.mark.parametrize("compose_file", ["compose.dev.yml", "compose.prod.yml"])
def test_every_service_has_a_healthcheck(compose_file: str) -> None:
    for name, svc in services(compose_file).items():
        build = svc.get("build")
        context = build.get("context") if isinstance(build, dict) else build
        image = svc.get("image", "")
        own_image = image.startswith(("smyou-backend:", "smyou-web:"))
        from_dockerfile = (context and dockerfile_has_healthcheck(context)) or (
            own_image and dockerfile_has_healthcheck("backend" if "backend" in image else "frontend")
        )
        assert "healthcheck" in svc or from_dockerfile, f"{compose_file}:{name} has no healthcheck"


@pytest.mark.ac("AC-SYS-019")
def test_dev_compose_runs_full_stack_on_localhost_only() -> None:
    svcs = services("compose.dev.yml")
    assert {"db", "backend", "web"} <= set(svcs)
    for name in ("backend", "web"):
        assert svcs[name]["build"]["target"] == "dev", name
    for name, svc in svcs.items():
        for port in svc.get("ports", []):
            assert str(port).startswith("127.0.0.1:"), f"{name} publishes {port} beyond localhost"
