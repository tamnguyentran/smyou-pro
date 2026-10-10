"""Syntax check of the system-nginx snippet for `/smyoutask/` via `nginx -t` (M9-01).

Run by `make e2e` (marker `docker`); needs a Docker daemon but not the full dev stack.
"""

import tempfile
from pathlib import Path

import pytest

from tests.docker.stack import run_allow_failure

pytestmark = pytest.mark.docker

ROOT = Path(__file__).resolve().parents[3]
CONF = ROOT / "ops" / "nginx" / "smyoutask.conf"

WRAPPER = """
events {}

http {
    # Zone có sẵn trên nginx hệ thống thật (TicketSeq/ChatBOT); khai báo để `nginx -t` chạy độc lập.
    limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;

    %s

    server {
        listen 80;
        server_name _;

        %s
    }
}
"""


@pytest.mark.ac("AC-SYS-101")
def test_nginx_syntax_is_valid() -> None:
    text = CONF.read_text(encoding="utf-8")
    upstream = text[: text.index("location")]
    locations = text[text.index("location") :]
    wrapped = WRAPPER % (upstream, locations)

    with tempfile.TemporaryDirectory() as tmp:
        conf_path = Path(tmp) / "test.conf"
        conf_path.write_text(wrapped, encoding="utf-8")
        result = run_allow_failure(
            "docker",
            "run",
            "--rm",
            "-v",
            f"{conf_path}:/etc/nginx/nginx.conf:ro",
            "nginx:alpine",
            "nginx",
            "-t",
        )
        # nginx -t writes its diagnostics to stderr, not stdout — must check both.
        output = result.stdout + result.stderr
        assert result.returncode == 0, output
        assert "[emerg]" not in output
        assert "[error]" not in output
