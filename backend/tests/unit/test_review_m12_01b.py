"""Tests added from the M12-01b independent review (security-auditor)."""

import asyncio

from fastapi import BackgroundTasks

from app.core.config import Settings
from app.modules.identity.router import _deferred_mailer, _e2e_last_mail_for


def test_deferred_mailer_schedules_instead_of_calling_synchronously() -> None:
    """A matching employee's SMTP send must not run before the HTTP response is built —
    otherwise forgot-password response latency reveals whether the account exists."""
    background_tasks = BackgroundTasks()
    sent: list[tuple[str, str, str]] = []

    def fake_mailer(_settings: Settings, to: str, subject: str, body: str) -> None:
        sent.append((to, subject, body))

    deferred = _deferred_mailer(background_tasks, fake_mailer)
    deferred(Settings(database_url="postgresql+psycopg://u:p@localhost/db"), "a@b.vn", "subj", "body")

    assert sent == [], "mailer must not run on the request-handling path"

    asyncio.run(background_tasks())

    assert sent == [("a@b.vn", "subj", "body")]


def test_e2e_last_mail_route_is_disabled_in_production() -> None:
    """Defense-in-depth: the route itself must refuse in production, not only rely on
    MAIL_CAPTURE_FILE being unset by config/compose."""
    settings = Settings(
        app_env="production",
        database_url="postgresql+psycopg://u:p@localhost/db",
        mail_capture_file=None,
    )

    assert _e2e_last_mail_for(settings, "a@b.vn") is None
