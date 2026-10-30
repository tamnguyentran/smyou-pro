"""M12-01a: reset-password — token redemption, session revocation, Q21 rules (AC-AUTH-046…051)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.security import verify_password
from tests.integration.conftest import (
    AN,
    KHOA,
    FakeClock,
    FakeMailer,
    employee_row,
    extract_reset_token,
    forgot_password,
    login,
    reset_password,
    reset_token_rows,
    seed,
)


def problem(body: dict[str, object]) -> dict[str, object]:
    return {"status": body["status"], "code": body["code"], "detail": body["detail"]}


def issue_token(api: TestClient, mailer: FakeMailer, email: str) -> str:
    forgot_password(api, email)
    return extract_reset_token(mailer)


@pytest.mark.ac("AC-AUTH-046")
def test_reset_changes_password_and_revokes_all_sessions(
    api: TestClient, db: Connection, mailer: FakeMailer
) -> None:
    an = seed(db, AN)
    other_device = login(api, AN.username, AN.password)
    assert other_device.status_code == 200
    token = issue_token(api, mailer, AN.email)

    res = reset_password(api, token, "SmYouMoi@9")

    assert res.status_code == 204
    row = employee_row(db, an)
    assert row["must_change_password"] is False

    assert verify_password("SmYouMoi@9", row["password_hash"])
    assert reset_token_rows(db, an)[-1]["used_at"] is not None
    sessions_live = db.execute(
        text("SELECT count(*) FROM auth_sessions WHERE employee_id = :id AND revoked_at IS NULL"),
        {"id": an},
    ).scalar_one()
    assert sessions_live == 0
    assert login(api, AN.username, AN.password).status_code == 401
    assert login(api, AN.username, "SmYouMoi@9").status_code == 200


@pytest.mark.ac("AC-AUTH-047")
def test_used_token_is_rejected(api: TestClient, db: Connection, mailer: FakeMailer) -> None:
    seed(db, AN)
    token = issue_token(api, mailer, AN.email)
    assert reset_password(api, token, "SmYouMoi@9").status_code == 204

    res = reset_password(api, token, "SmYouMoi2@9")

    assert res.status_code == 422
    assert problem(res.json()) == {
        "status": 422,
        "code": "INVALID_RESET_TOKEN",
        "detail": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
    }


@pytest.mark.ac("AC-AUTH-048")
def test_expired_token_is_rejected(
    api: TestClient, db: Connection, mailer: FakeMailer, clock: FakeClock
) -> None:
    seed(db, AN)
    token = issue_token(api, mailer, AN.email)
    clock.advance(minutes=30, seconds=1)

    res = reset_password(api, token, "SmYouMoi@9")

    assert res.status_code == 422
    assert res.json()["code"] == "INVALID_RESET_TOKEN"


@pytest.mark.ac("AC-AUTH-049")
def test_unknown_token_is_rejected(api: TestClient, db: Connection) -> None:
    seed(db, AN)

    res = reset_password(api, "khong-ton-tai-trong-db", "SmYouMoi@9")

    assert res.status_code == 422
    assert res.json()["code"] == "INVALID_RESET_TOKEN"


@pytest.mark.ac("AC-AUTH-050")
@pytest.mark.parametrize("bad_password", ["123", "SmYou@2026", "an.nguyenABC1"])
def test_invalid_new_password_is_422_and_token_not_consumed(
    api: TestClient, db: Connection, mailer: FakeMailer, bad_password: str
) -> None:
    seed(db, AN)
    token = issue_token(api, mailer, AN.email)

    res = reset_password(api, token, bad_password)

    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"
    assert "new_password" in [e["field"] for e in res.json()["errors"]]

    retry = reset_password(api, token, "SmYouMoi@9")
    assert retry.status_code == 204


@pytest.mark.ac("AC-AUTH-051")
def test_token_rejected_if_account_deactivated_after_issue(
    api: TestClient, db: Connection, mailer: FakeMailer
) -> None:
    seed(db, KHOA)
    token = issue_token(api, mailer, KHOA.email)
    db.execute(text("UPDATE employees SET is_active = false WHERE email = :email"), {"email": KHOA.email})

    res = reset_password(api, token, "SmYouMoi@9")

    assert res.status_code == 422
    assert res.json()["code"] == "INVALID_RESET_TOKEN"
