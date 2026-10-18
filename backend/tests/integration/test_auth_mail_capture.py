"""M12-01b §8: MAIL_CAPTURE_FILE + GET /auth/_e2e/last-mail — dev/CI-only mechanism so Playwright can
read the reset link when there is no real SMTP. No AC id of its own: infrastructure behind AC-AUTH-063
(frontend e2e). Uses the real mailer (not the `mailer` fixture's FakeMailer) so send_email's capture-file
write actually runs."""

import json
from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection
from sqlalchemy.orm import sessionmaker

from tests.integration.conftest import AN, FakeClock, forgot_password, seed


def _app_with_real_mailer(
    make_app: Callable[..., FastAPI], db: Connection, clock: FakeClock, **overrides: str
) -> FastAPI:
    app = make_app(**overrides)
    app.state.session_factory = sessionmaker(
        bind=db, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    app.state.clock = clock
    return app


def test_capture_file_records_email_and_endpoint_returns_it(
    make_app: Callable[..., FastAPI], db: Connection, clock: FakeClock, tmp_path: Path
) -> None:
    capture = tmp_path / "mail-capture.jsonl"
    app = _app_with_real_mailer(make_app, db, clock, mail_capture_file=str(capture))
    api = TestClient(app, raise_server_exceptions=False)
    seed(db, AN)

    forgot_password(api, AN.email)

    assert capture.exists()
    lines = capture.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["to"] == AN.email

    res = api.get("/api/v1/auth/_e2e/last-mail", params={"email": AN.email})
    assert res.status_code == 200
    body = res.json()
    assert body["subject"] == entry["subject"]
    assert "token=" in body["body"]


def test_endpoint_returns_latest_mail_for_the_address(
    make_app: Callable[..., FastAPI], db: Connection, clock: FakeClock, tmp_path: Path
) -> None:
    capture = tmp_path / "mail-capture.jsonl"
    app = _app_with_real_mailer(make_app, db, clock, mail_capture_file=str(capture))
    api = TestClient(app, raise_server_exceptions=False)
    seed(db, AN)

    forgot_password(api, AN.email)
    first_body = json.loads(capture.read_text(encoding="utf-8").strip().splitlines()[-1])["body"]
    forgot_password(api, AN.email)

    res = api.get("/api/v1/auth/_e2e/last-mail", params={"email": AN.email})
    assert res.status_code == 200
    assert res.json()["body"] != first_body


def test_endpoint_404_when_mail_capture_file_not_configured(
    make_app: Callable[..., FastAPI], db: Connection, clock: FakeClock
) -> None:
    app = _app_with_real_mailer(make_app, db, clock)
    api = TestClient(app, raise_server_exceptions=False)

    res = api.get("/api/v1/auth/_e2e/last-mail", params={"email": "khong-ton-tai@smyou.vn"})

    assert res.status_code == 404


def test_endpoint_404_when_no_mail_matches_the_address(
    make_app: Callable[..., FastAPI], db: Connection, clock: FakeClock, tmp_path: Path
) -> None:
    capture = tmp_path / "mail-capture.jsonl"
    app = _app_with_real_mailer(make_app, db, clock, mail_capture_file=str(capture))
    api = TestClient(app, raise_server_exceptions=False)
    seed(db, AN)
    forgot_password(api, AN.email)

    res = api.get("/api/v1/auth/_e2e/last-mail", params={"email": "khac@smyou.vn"})

    assert res.status_code == 404
