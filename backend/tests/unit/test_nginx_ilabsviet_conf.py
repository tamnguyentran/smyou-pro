"""Static checks of the system-nginx snippet for `/smyoutask/` (M9-01, DEPLOYMENT §5.1)."""

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]
CONF = ROOT / "deploy" / "nginx" / "ilabsviet-smyoutask.conf"


def conf_text() -> str:
    assert CONF.is_file(), f"{CONF} is missing"
    return CONF.read_text(encoding="utf-8")


@pytest.mark.ac("AC-SYS-025")
def test_required_directives_present() -> None:
    text = conf_text()
    assert "proxy_set_header X-Real-IP $remote_addr;" in text
    assert "proxy_set_header X-Forwarded-Proto $scheme;" in text
    assert "limit_req zone=perip" in text
    assert "client_max_body_size 12M" in text
    assert "proxy_pass http://smyoutask_ilabsviet;" in text
    assert "proxy_pass http://smyoutask_ilabsviet/" not in text

    match = re.search(r"location\s*=\s*/smyoutask\s*\{([^}]*)\}", text)
    assert match, "missing `location = /smyoutask { ... }` redirect block"
    redirect = re.search(r"return\s+301\s+(\S+);", match.group(1))
    assert redirect, "redirect block has no `return 301 ...;`"
    assert redirect.group(1).endswith("/"), "redirect target must end with /"


@pytest.mark.ac("AC-SYS-026")
def test_upstream_port_matches_compose_web_port() -> None:
    text = conf_text()
    upstream_match = re.search(r"server\s+127\.0\.0\.1:(\d+);", text)
    assert upstream_match, "missing `server 127.0.0.1:<port>;` inside upstream block"
    nginx_port = upstream_match.group(1)

    compose = yaml.safe_load((ROOT / "compose.prod.yml").read_text(encoding="utf-8"))
    web_ports = compose["services"]["web"]["ports"]
    assert web_ports == ["${WEB_BIND:-127.0.0.1}:${WEB_PORT:-6890}:80"]
    compose_port_match = re.search(r"WEB_PORT:-(\d+)", web_ports[0])
    assert compose_port_match
    compose_port = compose_port_match.group(1)

    assert nginx_port == compose_port
