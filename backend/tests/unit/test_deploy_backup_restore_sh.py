"""Static/behavioral checks of scripts/deploy.sh, backup.sh, restore_check.sh (M9-02)."""

from pathlib import Path

import pytest

from tests.docker.stack import run_allow_failure

ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SH = ROOT / "scripts" / "deploy.sh"
BACKUP_SH = ROOT / "scripts" / "backup.sh"
RESTORE_CHECK_SH = ROOT / "scripts" / "restore_check.sh"


@pytest.mark.ac("AC-SYS-105")
def test_deploy_without_tag_fails_fast() -> None:
    result = run_allow_failure("bash", str(DEPLOY_SH))
    assert result.returncode != 0
    assert "Thiếu TAG" in result.stderr
    assert "ssh" not in result.stdout
    assert "docker save" not in result.stdout


@pytest.mark.parametrize("tag", ["x$(touch /tmp/pwned)", "a;rm -rf /", "../etc", "a b"])
def test_deploy_rejects_shell_metacharacters_in_tag(tag: str) -> None:
    result = run_allow_failure("bash", str(DEPLOY_SH), tag)
    assert result.returncode != 0
    assert "TAG không hợp lệ" in result.stderr
    assert "ssh" not in result.stdout
    assert "docker save" not in result.stdout


@pytest.mark.ac("AC-SYS-107")
def test_deploy_dumps_before_load_and_never_builds() -> None:
    text = DEPLOY_SH.read_text(encoding="utf-8")
    assert "set -euo pipefail" in text

    dump_pos = text.index("pg_dump")
    load_pos = text.index("docker load")
    up_pos = text.index("up -d")
    assert dump_pos < load_pos
    assert dump_pos < up_pos

    assert "docker build" not in text
    assert "buildx build" not in text


@pytest.mark.ac("AC-SYS-114")
@pytest.mark.parametrize("script", [DEPLOY_SH, BACKUP_SH, RESTORE_CHECK_SH])
def test_scripts_are_valid_bash_and_executable(script: Path) -> None:
    assert script.is_file(), f"{script} is missing"

    syntax = run_allow_failure("bash", "-n", str(script))
    assert syntax.returncode == 0, syntax.stderr

    rel = script.relative_to(ROOT)
    tracked = run_allow_failure("git", "-C", str(ROOT), "ls-files", "-s", "--", str(rel))
    assert tracked.stdout, f"{rel} is not tracked by git yet"
    mode = tracked.stdout.split()[0]
    assert mode == "100755", f"{rel} git mode is {mode}, expected 100755 (executable)"
