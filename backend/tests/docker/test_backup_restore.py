"""scripts/backup.sh and scripts/restore_check.sh against the running `smoke-prod` stack (M9-02).

Run by `make smoke-prod` (marker `docker`). These two scripts run locally on the server by
cron (no SSH involved), so exercising them against the local `smoke-prod` stack is real
evidence of their on-server behavior, not a simulation.

Env: SMOKE_PROJECT (compose project of the running stack, default smyou-smoke).
"""

import os
import subprocess
import tarfile
import time
from pathlib import Path

import pytest

from tests.docker.stack import run, run_allow_failure, service_status

pytestmark = pytest.mark.docker

ROOT = Path(__file__).resolve().parents[3]
BACKUP_SH = ROOT / "scripts" / "backup.sh"
RESTORE_CHECK_SH = ROOT / "scripts" / "restore_check.sh"
PROJECT = os.environ.get("SMOKE_PROJECT", "smyou-smoke")
SEED_EMAIL = "m902-backup-test@example.com"


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
    args = ["docker", "exec", container, "psql", "-U", user, "-d", db]
    for variable in variables:
        args += ["-v", variable]
    args += ["-tAc", sql]
    return run(*args)


def ensure_seed_employee(container: str, user: str, db: str) -> None:
    psql(
        container,
        user,
        db,
        "INSERT INTO employees (code, full_name, email, department, password_hash) "
        "VALUES ('M902TST','Backup Test',:'email','MANAGEMENT','x') "
        "ON CONFLICT (email) DO NOTHING;",
        f"email={SEED_EMAIL}",
    )


def count_employees(container: str, user: str, db: str) -> int:
    return int(psql(container, user, db, "SELECT COUNT(*) FROM employees;").strip())


def uploads_volume() -> str:
    out = run(
        "docker",
        "volume",
        "ls",
        "--filter",
        f"label=com.docker.compose.project={PROJECT}",
        "--format",
        "{{.Name}}",
    )
    matches = [name for name in out.strip().splitlines() if name.endswith("uploads")]
    assert matches, f"no uploads volume found for project {PROJECT}"
    return matches[0]


def write_marker_file_to_uploads(marker: str) -> None:
    run(
        "docker",
        "run",
        "--rm",
        "-v",
        f"{uploads_volume()}:/data",
        "alpine",
        "sh",
        "-c",
        f"echo m9-02 > /data/{marker}",
    )


def restore_check_containers() -> list[str]:
    out = run(
        "docker",
        "ps",
        "-a",
        "--filter",
        "name=smyou-restore-check",
        "--format",
        "{{.Names}}",
    )
    return [line for line in out.strip().splitlines() if line]


def wait_db_healthy(timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    status = {}
    while time.time() < deadline:
        status = service_status(PROJECT)
        if "(healthy)" in status.get("db", ""):
            return
        time.sleep(2)
    raise AssertionError(f"db not healthy after {timeout}s: {status}")


def run_script(
    monkeypatch: pytest.MonkeyPatch, script: Path, backup_dir: Path
) -> subprocess.CompletedProcess[str]:
    monkeypatch.setenv("BACKUP_DIR", str(backup_dir))
    monkeypatch.setenv("COMPOSE_PROJECT", PROJECT)
    return run_allow_failure("bash", str(script))


@pytest.fixture
def seeded_employee() -> tuple[str, str, str]:
    container = db_container()
    assert container, f"no running db container for project {PROJECT}"
    user, db = pg_credentials(container)
    ensure_seed_employee(container, user, db)
    return container, user, db


@pytest.mark.ac("AC-SYS-108")
def test_backup_creates_valid_db_and_uploads_archives(
    seeded_employee: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = "ac-sys-108-marker.txt"
    write_marker_file_to_uploads(marker)

    result = run_script(monkeypatch, BACKUP_SH, tmp_path)
    assert result.returncode == 0, result.stderr

    dumps = sorted(tmp_path.glob("db-*.dump"))
    assert len(dumps) == 1, dumps
    listing = run_allow_failure(
        "docker",
        "run",
        "--rm",
        "-v",
        f"{dumps[0]}:/dump.dump:ro",
        "postgres:17",
        "pg_restore",
        "--list",
        "/dump.dump",
    )
    assert listing.returncode == 0, listing.stderr

    archives = sorted(tmp_path.glob("uploads-*.tar.gz"))
    assert len(archives) == 1, archives
    with tarfile.open(archives[0]) as tar:
        names = tar.getnames()
    assert any(marker in name for name in names), names


@pytest.mark.ac("AC-SYS-109")
def test_backup_keeps_14_newest_per_type(
    seeded_employee: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    old_db_names = [f"db-20260101T{i:02d}0000Z.dump" for i in range(14)]
    old_upload_names = [f"uploads-20260101T{i:02d}0000Z.tar.gz" for i in range(14)]
    for name in old_db_names + old_upload_names:
        (tmp_path / name).write_bytes(b"fake")

    result = run_script(monkeypatch, BACKUP_SH, tmp_path)
    assert result.returncode == 0, result.stderr

    remaining_dumps = sorted(p.name for p in tmp_path.glob("db-*.dump"))
    remaining_archives = sorted(p.name for p in tmp_path.glob("uploads-*.tar.gz"))
    assert len(remaining_dumps) == 14, remaining_dumps
    assert len(remaining_archives) == 14, remaining_archives
    assert old_db_names[0] not in remaining_dumps
    assert old_upload_names[0] not in remaining_archives
    assert set(old_db_names[1:]).issubset(remaining_dumps)
    assert set(old_upload_names[1:]).issubset(remaining_archives)


@pytest.mark.ac("AC-SYS-110")
def test_backup_fails_cleanly_when_db_down(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    container = db_container()
    assert container, f"no running db container for project {PROJECT}"
    run("docker", "stop", container)
    try:
        result = run_script(monkeypatch, BACKUP_SH, tmp_path)
        assert result.returncode != 0
        assert result.stderr.strip()
        assert list(tmp_path.glob("db-*.dump")) == []
        assert list(tmp_path.glob("*.dump.tmp")) == []
    finally:
        run("docker", "start", container)
        wait_db_healthy()


@pytest.mark.ac("AC-SYS-111")
def test_restore_check_succeeds_and_row_count_matches(
    seeded_employee: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    container, user, db = seeded_employee
    expected_count = count_employees(container, user, db)

    backup_result = run_script(monkeypatch, BACKUP_SH, tmp_path)
    assert backup_result.returncode == 0, backup_result.stderr

    result = run_script(monkeypatch, RESTORE_CHECK_SH, tmp_path)
    assert result.returncode == 0, result.stderr
    assert "khôi phục thử thành công" in result.stdout
    assert str(expected_count) in result.stdout
    assert restore_check_containers() == []


@pytest.mark.ac("AC-SYS-112")
def test_restore_check_fails_when_no_backup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    result = run_script(monkeypatch, RESTORE_CHECK_SH, tmp_path)
    assert result.returncode != 0
    assert "Không tìm thấy bản sao lưu" in result.stderr
    assert restore_check_containers() == []


@pytest.mark.ac("AC-SYS-113")
def test_restore_check_fails_and_cleans_up_on_corrupt_dump(
    seeded_employee: tuple[str, str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    backup_result = run_script(monkeypatch, BACKUP_SH, tmp_path)
    assert backup_result.returncode == 0, backup_result.stderr

    dumps = sorted(tmp_path.glob("db-*.dump"))
    assert len(dumps) == 1, dumps
    with dumps[0].open("r+b") as fh:
        fh.seek(20)
        fh.write(b"\x00\xff\x00\xff\x00\xff\x00\xff")

    result = run_script(monkeypatch, RESTORE_CHECK_SH, tmp_path)
    assert result.returncode != 0
    assert result.stderr.strip()
    assert restore_check_containers() == []
