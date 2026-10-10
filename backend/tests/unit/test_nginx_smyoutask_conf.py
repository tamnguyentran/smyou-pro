"""Static checks of the system-nginx snippet for `/smyoutask/` (M9-01, DEPLOYMENT.md §5.1)."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
CONF = ROOT / "ops" / "nginx" / "smyoutask.conf"
DEPLOYMENT_DOC = ROOT / "docs" / "architecture" / "DEPLOYMENT.md"


def conf_text() -> str:
    assert CONF.is_file(), f"{CONF} is missing"
    return CONF.read_text(encoding="utf-8")


@pytest.mark.ac("AC-SYS-102")
def test_required_directives_present() -> None:
    text = conf_text()
    assert "proxy_set_header X-Real-IP $remote_addr;" in text
    assert "proxy_set_header Connection 'upgrade';" in text
    assert "client_max_body_size 12M;" in text
    assert "limit_req zone=perip burst=20 nodelay;" in text
    assert "proxy_pass http://smyoutask_ilabsviet;" in text
    assert "proxy_pass http://smyoutask_ilabsviet/" not in text

    match = re.search(r"location\s*=\s*/smyoutask\s*\{([^}]*)\}", text)
    assert match, "missing `location = /smyoutask { ... }` redirect block"
    redirect = re.search(r"return\s+301\s+(\S+);", match.group(1))
    assert redirect, "redirect block has no `return 301 ...;`"
    assert redirect.group(1).endswith("/"), "redirect target must end with /"


def _normalized_lines(text: str) -> list[str]:
    return [line.strip() for line in text.strip().splitlines() if line.strip()]


@pytest.mark.ac("AC-SYS-103")
def test_matches_deployment_doc_block() -> None:
    doc_text = DEPLOYMENT_DOC.read_text(encoding="utf-8")
    match = re.search(r"```nginx\n(.*?)```", doc_text, re.DOTALL)
    assert match, "DEPLOYMENT.md §5.1 missing the ```nginx fenced block"

    assert _normalized_lines(match.group(1)) == _normalized_lines(conf_text())


@pytest.mark.ac("AC-SYS-104")
def test_deployment_doc_documents_port_check_before_deploy() -> None:
    doc_text = DEPLOYMENT_DOC.read_text(encoding="utf-8")
    assert "ss -ltnp" in doc_text
    assert "6890" in doc_text
    assert "WEB_PORT" in doc_text
