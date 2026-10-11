"""scripts/golive_check.sh against the running `smoke-prod` stack (M9-03).

Run by `make smoke-prod` (marker `docker`). Reuses the smoke-prod `.env.prod.example`
env file (with CHANGE-ME values filled) and the same container-lookup convention as
scripts/backup.sh (COMPOSE_PROJECT label filter) to check DB state.

Env: SMOKE_PROJECT (compose project of the running stack, default smyou-smoke).
"""

import os
from pathlib import Path

import pytest

from tests.docker.stack import run, run_allow_failure

pytestmark = pytest.mark.docker

ROOT = Path(__file__).resolve().parents[3]
GOLIVE_CHECK_SH = ROOT / "scripts" / "golive_check.sh"
ENV_EXAMPLE = ROOT / ".env.prod.example"
PROJECT = os.environ.get("SMOKE_PROJECT", "smyou-smoke")


def db_container() -> str:
    out = run(
        "docker",
        "ps",
        "--filter",
        f"label=com.docker.compose.project={PROJECT}",
        "--filter",
        "label=com.docker.compose.service=db",
        "--format",
        "{{.Names}}",
    )
    names = out.strip().splitlines()
    return names[0] if names else ""


def pg_credentials(container: str) -> tuple[str, str]:
    user = run("docker", "exec", container, "printenv", "POSTGRES_USER").strip()
    db = run("docker", "exec", container, "printenv", "POSTGRES_DB").strip()
    return user, db


def psql(container: str, user: str, db: str, sql: str, *variables: str) -> str:
    args = ["docker", "exec", "-i", container, "psql", "-U", user, "-d", db, "-tA"]
    for variable in variables:
        args += ["-v", variable]
    return run(*args, stdin=sql)


def clear_table(container: str, user: str, db: str, table: str) -> None:
    psql(container, user, db, f"DELETE FROM {table};")  # noqa: S608  # table is a local literal, not user input


def valid_env_file(tmp_path: Path) -> Path:
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    text = text.replace("CHANGE-ME-long-random", "a-real-long-random-secret-value")
    text = text.replace("CHANGE-ME", "a-real-value")
    env_file = tmp_path / ".env.prod"
    env_file.write_text(text, encoding="utf-8")
    return env_file


def run_golive_check(monkeypatch: pytest.MonkeyPatch, env_file: Path):
    monkeypatch.setenv("COMPOSE_PROJECT", PROJECT)
    return run_allow_failure("bash", str(GOLIVE_CHECK_SH), "--env-file", str(env_file))


@pytest.fixture
def db_handle() -> tuple[str, str, str]:
    container = db_container()
    assert container, f"no running db container for project {PROJECT}"
    user, db = pg_credentials(container)
    return container, user, db


@pytest.mark.ac("AC-SYS-115")
def test_golive_check_passes_when_env_and_db_clean(
    db_handle: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    container, user, db = db_handle
    clear_table(container, user, db, "employees")
    psql(
        container,
        user,
        db,
        "INSERT INTO employees (code, full_name, email, department, password_hash) "
        "VALUES ('MGR001','Real Manager','golive-manager@smyou.vn','MANAGEMENT','x');",
    )

    result = run_golive_check(monkeypatch, valid_env_file(tmp_path))
    assert result.returncode == 0, result.stderr
    assert "Sẵn sàng go-live" in result.stdout


@pytest.mark.ac("AC-SYS-119")
def test_golive_check_fails_when_no_employees(
    db_handle: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    container, user, db = db_handle
    clear_table(container, user, db, "employees")

    result = run_golive_check(monkeypatch, valid_env_file(tmp_path))
    assert result.returncode != 0
    assert "Quản lý chung" in result.stderr


@pytest.mark.ac("AC-SYS-120")
def test_golive_check_fails_when_e2e_data_present(
    db_handle: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    container, user, db = db_handle
    clear_table(container, user, db, "employees")
    psql(
        container,
        user,
        db,
        "INSERT INTO employees (code, full_name, email, department, password_hash) "
        "VALUES ('E2E01','E2E Employee','golive-e2e@smyou.vn','MANAGEMENT','x');",
    )
    psql(
        container,
        user,
        db,
        "INSERT INTO products (sku, name, category, unit, price) "
        "VALUES ('E2E-MON-001','E2E Monitor','MONITOR','CAI',1000) ON CONFLICT (sku) DO NOTHING;",
    )
    psql(
        container,
        user,
        db,
        "INSERT INTO services (code, name, category, unit, price) "
        "VALUES ('E2E-DV-001','E2E Service','REPAIR','GIO',1000) ON CONFLICT (code) DO NOTHING;",
    )

    result = run_golive_check(monkeypatch, valid_env_file(tmp_path))
    assert result.returncode != 0
    assert "employees" in result.stderr
    assert "products" in result.stderr
    assert "services" in result.stderr
