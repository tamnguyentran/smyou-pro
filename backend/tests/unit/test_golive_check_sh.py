"""Static/behavioral checks of scripts/golive_check.sh that don't need a live DB (M9-03)."""

from pathlib import Path

import pytest

from tests.docker.stack import run_allow_failure

ROOT = Path(__file__).resolve().parents[3]
GOLIVE_CHECK_SH = ROOT / "scripts" / "golive_check.sh"
ENV_EXAMPLE = ROOT / ".env.prod.example"


def valid_env_file(tmp_path: Path, **overrides: str) -> Path:
    """A copy of .env.prod.example with every CHANGE-ME value filled, plus overrides."""
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    text = text.replace("CHANGE-ME-long-random", "a-real-long-random-secret-value")
    text = text.replace("CHANGE-ME", "a-real-value")
    env_file = tmp_path / ".env.prod"
    lines = text.splitlines()
    for key, value in overrides.items():
        lines = [f"{key}={value}" if line.startswith(f"{key}=") else line for line in lines]
    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return env_file


@pytest.mark.ac("AC-SYS-116")
def test_fails_without_env_file() -> None:
    result = run_allow_failure("bash", str(GOLIVE_CHECK_SH))
    assert result.returncode != 0
    assert "--env-file" in result.stderr


@pytest.mark.ac("AC-SYS-116")
def test_fails_with_nonexistent_env_file(tmp_path: Path) -> None:
    missing = tmp_path / "does-not-exist.env"
    result = run_allow_failure("bash", str(GOLIVE_CHECK_SH), "--env-file", str(missing))
    assert result.returncode != 0
    assert "--env-file" in result.stderr


@pytest.mark.ac("AC-SYS-117")
def test_fails_on_change_me_before_db_check(tmp_path: Path) -> None:
    env_file = valid_env_file(tmp_path)
    text = env_file.read_text(encoding="utf-8")
    text = "\n".join(
        "JWT_SECRET=CHANGE-ME" if line.startswith("JWT_SECRET=") else line for line in text.splitlines()
    )
    env_file.write_text(text, encoding="utf-8")

    result = run_allow_failure("bash", str(GOLIVE_CHECK_SH), "--env-file", str(env_file))
    assert result.returncode != 0
    assert "JWT_SECRET" in result.stderr


@pytest.mark.ac("AC-SYS-118")
def test_fails_on_insecure_cookie(tmp_path: Path) -> None:
    env_file = valid_env_file(tmp_path, COOKIE_SECURE="false")
    result = run_allow_failure("bash", str(GOLIVE_CHECK_SH), "--env-file", str(env_file))
    assert result.returncode != 0
    assert "COOKIE_SECURE" in result.stderr


@pytest.mark.ac("AC-SYS-118")
def test_fails_on_public_web_bind(tmp_path: Path) -> None:
    env_file = valid_env_file(tmp_path, WEB_BIND="0.0.0.0")  # noqa: S104  # asserting the script rejects this, not binding to it
    result = run_allow_failure("bash", str(GOLIVE_CHECK_SH), "--env-file", str(env_file))
    assert result.returncode != 0
    assert "WEB_BIND" in result.stderr


@pytest.mark.ac("AC-SYS-121")
def test_golive_check_is_valid_bash_and_executable() -> None:
    assert GOLIVE_CHECK_SH.is_file(), f"{GOLIVE_CHECK_SH} is missing"

    syntax = run_allow_failure("bash", "-n", str(GOLIVE_CHECK_SH))
    assert syntax.returncode == 0, syntax.stderr

    rel = GOLIVE_CHECK_SH.relative_to(ROOT)
    tracked = run_allow_failure("git", "-C", str(ROOT), "ls-files", "-s", "--", str(rel))
    assert tracked.stdout, f"{rel} is not tracked by git yet"
    mode = tracked.stdout.split()[0]
    assert mode == "100755", f"{rel} git mode is {mode}, expected 100755 (executable)"
