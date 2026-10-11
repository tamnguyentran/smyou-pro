"""Helpers for tests that run against a live Docker stack (marker `docker`; run by make e2e / smoke-prod)."""

import http.client
import subprocess
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Reply:
    status: int
    headers: dict[str, str]
    body: str


def fetch(url: str, headers: dict[str, str] | None = None) -> Reply:
    """GET without following redirects; header names lower-cased."""
    parts = urlsplit(url)
    conn = http.client.HTTPConnection(parts.hostname or "127.0.0.1", parts.port or 80, timeout=10)
    try:
        path = parts.path + (f"?{parts.query}" if parts.query else "")
        conn.request("GET", path, headers=headers or {})
        res = conn.getresponse()
        return Reply(
            res.status,
            {k.lower(): v for k, v in res.getheaders()},
            res.read().decode("utf-8", errors="replace"),
        )
    finally:
        conn.close()


def run(*argv: str, stdin: str | None = None) -> str:
    result = subprocess.run(  # noqa: S603  # argv passed as caller-controlled tuple, no shell
        argv, input=stdin, capture_output=True, text=True, timeout=120, check=False
    )
    assert result.returncode == 0, f"{' '.join(argv)} failed: {result.stderr}"
    return result.stdout


def run_allow_failure(*argv: str) -> subprocess.CompletedProcess[str]:
    """Like `run()` but returns the full result instead of asserting success.

    For callers that need to inspect stderr themselves, e.g. `nginx -t` which
    writes its diagnostics to stderr regardless of exit status.
    """
    return subprocess.run(  # noqa: S603  # argv passed as caller-controlled tuple, no shell
        argv, capture_output=True, text=True, timeout=120, check=False
    )


def service_status(project: str) -> dict[str, str]:
    """compose service name → `docker ps` status (e.g. "Up 5 seconds (healthy)")."""
    fmt = '{{.Label "com.docker.compose.service"}}\t{{.Status}}'
    out = run("docker", "ps", "--filter", f"label=com.docker.compose.project={project}", "--format", fmt)
    return dict(line.split("\t", 1) for line in out.splitlines() if line.strip())
