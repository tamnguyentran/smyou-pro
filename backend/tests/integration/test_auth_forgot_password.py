"""M12-01a: forgot-password — rate limit, generic response, token issuance (AC-AUTH-040…045)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from tests.integration.conftest import (
    AN,
    KHOA,
    FakeClock,
    FakeMailer,
    extract_reset_token,
    forgot_password,
    reset_password,
    reset_token_rows,
    seed,
)

GENERIC_DETAIL = (
    "Nếu email tồn tại và tài khoản đang hoạt động, chúng tôi đã gửi email hướng dẫn đặt lại mật khẩu."
)


def problem(body: dict[str, object]) -> dict[str, object]:
    return {"status": body["status"], "code": body["code"], "detail": body["detail"]}


@pytest.mark.ac("AC-AUTH-040")
def test_sends_reset_email_for_active_account(api: TestClient, db: Connection, mailer: FakeMailer) -> None:
    an = seed(db, AN)

    res = forgot_password(api, AN.email)

    assert res.status_code == 200
    assert res.json() == {"detail": GENERIC_DETAIL}
    rows = reset_token_rows(db, an)
    assert len(rows) == 1
    assert rows[0]["used_at"] is None
    assert len(rows[0]["token_hash"]) == 64
    to, _subject, body = mailer.sent[-1]
    assert to == AN.email
    assert f"/reset-password?token={extract_reset_token(mailer)}" in body


@pytest.mark.ac("AC-AUTH-041")
def test_unknown_email_gets_identical_response(api: TestClient, db: Connection, mailer: FakeMailer) -> None:
    seed(db, AN)

    res = forgot_password(api, "ai.do@smyou.vn")

    assert res.status_code == 200
    assert res.json() == {"detail": GENERIC_DETAIL}
    assert not mailer.sent


@pytest.mark.ac("AC-AUTH-042")
def test_inactive_account_gets_identical_response(
    api: TestClient, db: Connection, mailer: FakeMailer
) -> None:
    khoa = seed(db, KHOA, is_active=False)

    res = forgot_password(api, KHOA.email)

    assert res.status_code == 200
    assert res.json() == {"detail": GENERIC_DETAIL}
    assert not mailer.sent
    assert reset_token_rows(db, khoa) == []


@pytest.mark.ac("AC-AUTH-043")
@pytest.mark.parametrize("email", [AN.email, "ai.do@smyou.vn"])
def test_fourth_request_in_an_hour_is_rate_limited(
    api: TestClient, db: Connection, clock: FakeClock, email: str
) -> None:
    seed(db, AN)
    for _ in range(3):
        assert forgot_password(api, email).status_code == 200

    fourth = forgot_password(api, email)
    assert fourth.status_code == 429
    assert problem(fourth.json()) == {
        "status": 429,
        "code": "TOO_MANY_REQUESTS",
        "detail": "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.",
    }

    clock.advance(hours=1)
    fifth = forgot_password(api, email)
    assert fifth.status_code == 200
    assert fifth.json() == {"detail": GENERIC_DETAIL}


@pytest.mark.ac("AC-AUTH-044")
@pytest.mark.parametrize(
    "payload",
    [{}, {"email": "khong-phai-email"}],
)
def test_invalid_payload_is_422(api: TestClient, payload: dict[str, str]) -> None:
    res = api.post("/api/v1/auth/forgot-password", json=payload)

    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"
    assert "email" in [e["field"] for e in res.json()["errors"]]


@pytest.mark.ac("AC-AUTH-045")
def test_second_request_invalidates_first_token(api: TestClient, db: Connection, mailer: FakeMailer) -> None:
    an = seed(db, AN)
    forgot_password(api, AN.email)
    t1 = extract_reset_token(mailer)
    forgot_password(api, AN.email)
    t2 = extract_reset_token(mailer)
    assert t1 != t2

    invalid = reset_password(api, t1, "SmYouMoi@9")
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_RESET_TOKEN"

    valid = reset_password(api, t2, "SmYouMoi@9")
    assert valid.status_code == 204
    rows = reset_token_rows(db, an)
    assert len(rows) == 2
