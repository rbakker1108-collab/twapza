"""Sending email (password resets). Without SMTP settings the message goes to the log."""

import logging
import smtplib
from email.message import EmailMessage

from twapza.config import get_settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.smtp_host:
        log.warning("No SMTP server configured (TWAPZA_SMTP_HOST); email to %s:\n%s\n%s",
                    to, subject, body)
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            password = settings.smtp_password.get_secret_value() if settings.smtp_password else ""
            smtp.login(settings.smtp_username, password)
        smtp.send_message(msg)
