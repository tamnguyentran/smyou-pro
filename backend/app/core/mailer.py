"""SMTP email sending (ADR-015) — Gmail only, synchronous, stdlib-only. Used by forgot-password (M12-01a).

Errors never reach the caller: a failed/unconfigured send only logs server-side, so a reset request
always gets the same generic response regardless of SMTP health (no account-existence leak).
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import Settings

logger = logging.getLogger(__name__)


def send_email(settings: Settings, to: str, subject: str, body: str) -> None:
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
