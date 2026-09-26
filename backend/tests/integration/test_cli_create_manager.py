"""M1-01a: `python -m app.cli create-manager` bootstraps the first Manager (AC-AUTH-018)."""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.orm import Session, sessionmaker

from app import cli
from tests.integration.conftest import login

ARGS = ["create-manager", "--email", "an.nguyen@smyou.vn", "--full-name", "Nguyễn Văn An", "--code", "NV001"]


@pytest.fixture
def session_factory(db: Connection) -> sessionmaker[Session]:
    return sessionmaker(bind=db, join_transaction_mode="create_savepoint", expire_on_commit=False)


def typed(monkeypatch: pytest.MonkeyPatch, *answers: str) -> Iterator[str]:
    it = iter(answers)
    monkeypatch.setattr("getpass.getpass", lambda prompt="": next(it))
    return it


def managers(db: Connection) -> list[dict[str, object]]:
    rows = db.execute(
        text(
            "SELECT e.email, e.code, e.full_name, e.must_change_password, r.role FROM employees e"
            " JOIN employee_roles r ON r.employee_id = e.id WHERE e.email = 'an.nguyen@smyou.vn'"
        )
    )
    return [dict(r) for r in rows.mappings()]


@pytest.mark.ac("AC-AUTH-018")
def test_creates_manager_who_can_log_in(
    monkeypatch: pytest.MonkeyPatch, db: Connection, session_factory: sessionmaker[Session], app: FastAPI
) -> None:
    typed(monkeypatch, "SmYou@2026", "SmYou@2026")

    code = cli.main(ARGS, session_factory=session_factory)

    assert code == 0
    assert managers(db) == [
        {
            "email": "an.nguyen@smyou.vn",
            "code": "NV001",
            "full_name": "Nguyễn Văn An",
            "must_change_password": False,
            "role": "MANAGER",
        }
    ]
    assert login(TestClient(app), "an.nguyen@smyou.vn", "SmYou@2026").status_code == 200


@pytest.mark.ac("AC-AUTH-018")
def test_duplicate_email_exits_1(
    monkeypatch: pytest.MonkeyPatch,
    db: Connection,
    session_factory: sessionmaker[Session],
    capsys: pytest.CaptureFixture[str],
) -> None:
    typed(monkeypatch, "SmYou@2026", "SmYou@2026", "Khac@2026x", "Khac@2026x")
    assert cli.main(ARGS, session_factory=session_factory) == 0

    assert cli.main(ARGS, session_factory=session_factory) == 1
    assert "Email đã tồn tại" in capsys.readouterr().err
    assert len(managers(db)) == 1


@pytest.mark.ac("AC-AUTH-018")
@pytest.mark.parametrize(("first", "second"), [("SmYou@2026", "SmYou@2027"), ("ngan", "ngan")])
def test_bad_password_exits_1_without_creating(
    monkeypatch: pytest.MonkeyPatch,
    db: Connection,
    session_factory: sessionmaker[Session],
    first: str,
    second: str,
) -> None:
    typed(monkeypatch, first, second)

    assert cli.main(ARGS, session_factory=session_factory) == 1
    assert managers(db) == []


@pytest.mark.ac("AC-AUTH-018")
@pytest.mark.parametrize(
    "variant",
    [
        ["create-manager", "--email", " AN.NGUYEN@smyou.vn ", "--full-name", "Khác", "--code", "NV099"],
        ["create-manager", "--email", "khac@smyou.vn", "--full-name", "Khác", "--code", "NV001"],
    ],
    ids=["same-email-other-case", "same-code"],
)
def test_duplicates_are_detected_case_insensitively(
    monkeypatch: pytest.MonkeyPatch,
    db: Connection,
    session_factory: sessionmaker[Session],
    variant: list[str],
) -> None:
    typed(monkeypatch, "SmYou@2026", "SmYou@2026", "Khac@2026x", "Khac@2026x")
    assert cli.main(ARGS, session_factory=session_factory) == 0
    assert cli.main(variant, session_factory=session_factory) == 1


@pytest.mark.ac("AC-AUTH-018")
def test_password_containing_email_name_is_refused(
    monkeypatch: pytest.MonkeyPatch, db: Connection, session_factory: sessionmaker[Session]
) -> None:
    typed(monkeypatch, "an.nguyen-2026", "an.nguyen-2026")
    assert cli.main(ARGS, session_factory=session_factory) == 1
    assert managers(db) == []


@pytest.mark.ac("AC-AUTH-019")
def test_cli_stores_argon2id(
    monkeypatch: pytest.MonkeyPatch, db: Connection, session_factory: sessionmaker[Session]
) -> None:
    typed(monkeypatch, "SmYou@2026", "SmYou@2026")
    assert cli.main(ARGS, session_factory=session_factory) == 0
    stored = db.execute(text("SELECT password_hash FROM employees WHERE code = 'NV001'")).scalar_one()
    assert stored.startswith("$argon2id$")
