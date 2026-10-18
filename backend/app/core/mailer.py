"""SMTP email sending (ADR-015) — Gmail only, synchronous, stdlib-only. Used by forgot-password (M12-01a).

Errors never reach the caller: a failed/unconfigured send only logs server-side, so a reset request
always gets the same generic response regardless of SMTP health (no account-existence leak).

M12-01b §8: when `settings.mail_capture_file` is set (dev/CI only), every "sent" email is also
appended to that file so Playwright can read the reset link via GET /auth/_e2e/last-mail.
"""

import json
import logging
import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.core.config import Settings

logger = logging.getLogger(__name__)


def _capture(capture_file: Path, to: str, subject: str, body: str) -> None:
    """M12-01b §8: record every "sent" email as a JSON line, for GET /auth/_e2e/last-mail (dev/CI only)."""
    capture_file.parent.mkdir(parents=True, exist_ok=True)
    with capture_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"to": to, "subject": subject, "body": body}) + "\n")


def send_email(settings: Settings, to: str, subject: str, body: str) -> None:
    if settings.mail_capture_file is not None:
        _capture(settings.mail_capture_file, to, subject, body)
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password and settings.smtp_from):
        logger.warning("SMTP not configured; skipping email send")
        return
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from
    message["To"] = to
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError):
        logger.exception("failed to send email")
