import logging
import smtplib
import ssl
from email.message import EmailMessage

import pytest
from fastapi import HTTPException

from lib import emailer


def _configure_smtp(monkeypatch):
    monkeypatch.setattr(emailer, "APP_URL", "https://180days.example")
    monkeypatch.setattr(emailer, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(emailer, "SMTP_PORT", "587")
    monkeypatch.setattr(emailer, "SMTP_USERNAME", "180dayys@gmail.com")
    monkeypatch.setattr(emailer, "SMTP_PASSWORD", "test-app-password")
    monkeypatch.setattr(emailer, "SMTP_FROM_EMAIL", "180dayys@gmail.com")
    monkeypatch.setattr(emailer, "SMTP_FROM_NAME", "180Days")
    monkeypatch.setattr(emailer, "SMTP_USE_TLS", "true")


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout):
        self.args = (host, port, timeout)
        self.calls = []
        self.message = None
        self.__class__.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def ehlo(self):
        self.calls.append(("ehlo",))

    def starttls(self, *, context):
        self.calls.append(("starttls", context))

    def login(self, username, password):
        self.calls.append(("login", username, password))

    def send_message(self, message):
        self.calls.append(("send_message",))
        self.message = message
        return {}


@pytest.mark.asyncio
async def test_smtp_uses_starttls_and_sends_multipart_email(monkeypatch):
    _configure_smtp(monkeypatch)
    FakeSMTP.instances.clear()
    monkeypatch.setattr(emailer.smtplib, "SMTP", FakeSMTP)
    subject, html = emailer.verification_code_email("A <User>", "004201")

    message_id = await emailer.send_email(
        to="test-user@gmail.com",
        subject=subject,
        html=html,
        idempotency_key="daily-reminder-user-1-2026-11-17",
    )

    smtp = FakeSMTP.instances[0]
    assert smtp.args == ("smtp.gmail.com", 587, 15)
    assert smtp.calls[0] == ("ehlo",)
    assert smtp.calls[1][0] == "starttls"
    assert isinstance(smtp.calls[1][1], ssl.SSLContext)
    assert smtp.calls[1][1].verify_mode == ssl.CERT_REQUIRED
    assert smtp.calls[2] == ("ehlo",)
    assert smtp.calls[3] == (
        "login",
        "180dayys@gmail.com",
        "test-app-password",
    )
    assert smtp.calls[4][0] == "send_message"
    message = smtp.message
    assert isinstance(message, EmailMessage)
    assert message["Subject"] == "Your 180Days Verification Code"
    assert message["From"] == "180Days <180dayys@gmail.com>"
    assert message["Message-ID"] == message_id
    assert "daily-reminder-user-1-2026-11-17" not in str(message)
    assert message.get_content_type() == "multipart/alternative"
    assert "004201" in message.get_body(preferencelist=("plain",)).get_content()
    html_part = message.get_body(preferencelist=("html",)).get_content()
    assert "004201" in html_part
    assert "A &lt;User&gt;!" in html_part


@pytest.mark.asyncio
async def test_missing_smtp_configuration_fails_without_connecting(monkeypatch, caplog):
    _configure_smtp(monkeypatch)
    monkeypatch.setattr(emailer, "SMTP_PASSWORD", "")

    def smtp_must_not_be_called(*_args, **_kwargs):
        raise AssertionError("SMTP connection attempted without a password")

    monkeypatch.setattr(emailer.smtplib, "SMTP", smtp_must_not_be_called)
    with caplog.at_level(logging.WARNING, logger="lib.emailer"):
        with pytest.raises(HTTPException) as exc_info:
            await emailer.send_email(
                to="test-user@gmail.com",
                subject="Verification",
                html='<a href="https://180days.example/">Open</a>',
            )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == (
        "Email delivery is not configured in this environment."
    )
    assert "test-app-password" not in caplog.text
    assert "test-user@gmail.com" not in caplog.text


@pytest.mark.asyncio
async def test_smtp_authentication_failure_is_safe_and_does_not_log_secrets(
    monkeypatch, caplog
):
    _configure_smtp(monkeypatch)

    class AuthenticationFailure(FakeSMTP):
        def login(self, _username, _password):
            raise smtplib.SMTPAuthenticationError(
                535, b"secret SMTP response and password"
            )

    monkeypatch.setattr(emailer.smtplib, "SMTP", AuthenticationFailure)
    with caplog.at_level(logging.ERROR, logger="lib.emailer"):
        with pytest.raises(HTTPException) as exc_info:
            await emailer.send_email(
                to="test-user@gmail.com",
                subject="Verification",
                html='<a href="https://180days.example/">Open</a>',
            )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Email delivery is temporarily unavailable."
    assert "secret SMTP response" not in caplog.text
    assert "test-app-password" not in caplog.text
    assert "test-user@gmail.com" not in caplog.text


@pytest.mark.asyncio
async def test_smtp_connection_error_is_sanitized(monkeypatch, caplog):
    _configure_smtp(monkeypatch)

    class ConnectionFailure:
        def __init__(self, *_args, **_kwargs):
            raise OSError("private-host.example.test timeout detail")

    monkeypatch.setattr(emailer.smtplib, "SMTP", ConnectionFailure)
    with caplog.at_level(logging.ERROR, logger="lib.emailer"):
        with pytest.raises(HTTPException) as exc_info:
            await emailer.send_email(
                to="test-user@gmail.com",
                subject="Verification",
                html='<a href="https://180days.example/">Open</a>',
            )

    assert exc_info.value.status_code == 503
    assert "private-host.example.test" not in caplog.text
    assert "timeout detail" not in caplog.text


@pytest.mark.asyncio
async def test_smtp_refuses_to_send_without_starttls(monkeypatch):
    _configure_smtp(monkeypatch)
    monkeypatch.setattr(emailer, "SMTP_USE_TLS", "false")

    def smtp_must_not_be_called(*_args, **_kwargs):
        raise AssertionError("SMTP connection attempted without STARTTLS")

    monkeypatch.setattr(emailer.smtplib, "SMTP", smtp_must_not_be_called)
    with pytest.raises(HTTPException) as exc_info:
        await emailer.send_email(
            to="test-user@gmail.com",
            subject="Verification",
            html='<a href="https://180days.example/">Open</a>',
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_reserved_test_recipient_never_reaches_smtp(monkeypatch):
    _configure_smtp(monkeypatch)

    def smtp_must_not_be_called(*_args, **_kwargs):
        raise AssertionError("SMTP connection attempted for a reserved test address")

    monkeypatch.setattr(emailer.smtplib, "SMTP", smtp_must_not_be_called)
    with pytest.raises(HTTPException) as exc_info:
        await emailer.send_email(
            to="test-user@example.com",
            subject="Verification",
            html='<a href="https://180days.example/">Open</a>',
        )

    assert exc_info.value.status_code == 503


def test_verification_code_email_has_requested_content_and_escapes_dynamic_values(
    monkeypatch,
):
    monkeypatch.setattr(emailer, "APP_URL", "https://180days.example")

    subject, html = emailer.verification_code_email("<Test User>", "004201")

    emailer._assert_safe_email(subject, html)
    assert subject == "Your 180Days Verification Code"
    assert "background:#101a3a" in html
    assert "background:#eef0ff" in html
    assert "Hey &lt;Test User&gt;!" in html
    assert "004201" in html
    assert "10 minutes" in html
    assert "Please don't share it with anyone" in html
    assert "If you didn't request this verification code" in html
    assert "Team 180Days — Build Your Next 180 Days." in html
    assert "<Test User>" not in html
    assert "180Days" in emailer._plain_text(html)
    assert "004201" in emailer._plain_text(html)
