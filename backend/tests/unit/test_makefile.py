"""Every documented Makefile target parses, and pre-commit can be installed (M0-03)."""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
TARGETS = re.findall(r"^([a-zA-Z0-9_-]+):.*?## ", (ROOT / "Makefile").read_text(encoding="utf-8"), re.M)


@pytest.mark.ac("AC-SYS-023")
def test_makefile_documents_the_contract_targets() -> None:
    expected = {"setup", "up", "down", "lint", "typecheck", "test-unit", "test", "contract", "ac"}
    expected |= {"migrations-check", "check-fast", "check", "e2e", "verify", "build-prod", "smoke-prod"}
    assert expected <= set(TARGETS)


@pytest.mark.ac("AC-SYS-023")
@pytest.mark.parametrize("target", TARGETS)
def test_make_dry_run(target: str) -> None:
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell
        ["make", "-n", target, "TAG=dry-run"],  # noqa: S607 - make from PATH
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.ac("AC-SYS-023")
def test_pre_commit_config_is_valid() -> None:
    uvx = shutil.which("uvx")
    assert uvx is not None, "uvx is required (installed with uv)"
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell
        [uvx, "pre-commit", "validate-config", ".pre-commit-config.yaml"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
