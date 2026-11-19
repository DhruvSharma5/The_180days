import pytest

from lib import emailer


@pytest.mark.asyncio
async def test_local_email_does_not_call_provider(monkeypatch):
    monkeypatch.setattr(emailer, "APP_URL", "http://localhost:3000")
    monkeypatch.setattr(emailer, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(emailer, "FROM_EMAIL", "180Days <test@example.com>")

    def provider_must_not_be_called(*args, **kwargs):
        raise AssertionError("local email attempted to call the provider")

    monkeypatch.setattr(emailer.httpx, "AsyncClient", provider_must_not_be_called)
    html = '<a href="http://localhost:3000/">Verify your email</a>'
    assert (
        await emailer.send_email(to="user@example.com", subject="Test", html=html)
        is None
    )


@pytest.mark.asyncio
async def test_missing_resend_configuration_skips_provider(monkeypatch):
    monkeypatch.setattr(emailer, "APP_URL", "https://180days.example")
    monkeypatch.setattr(emailer, "RESEND_API_KEY", "")
    monkeypatch.setattr(emailer, "FROM_EMAIL", "180Days <hello@example.com>")

    def provider_must_not_be_called(*args, **kwargs):
        raise AssertionError("email attempted without Resend credentials")

    monkeypatch.setattr(emailer.httpx, "AsyncClient", provider_must_not_be_called)
    assert (
        await emailer.send_email(
            to="user@example.com",
            subject="Verification",
            html='<a href="https://180days.example/">Open</a>',
        )
        is None
    )


@pytest.mark.asyncio
async def test_resend_request_uses_configured_sender_and_idempotency_key(monkeypatch):
    monkeypatch.setattr(emailer, "APP_URL", "https://180days.example")
    monkeypatch.setattr(emailer, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(emailer, "FROM_EMAIL", "180Days <hello@example.com>")
    requests = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"id": "email_123"}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def post(self, url, *, headers, json):
            requests.append((url, headers, json))
            return Response()

    monkeypatch.setattr(emailer.httpx, "AsyncClient", lambda **_: Client())
    email_id = await emailer.send_email(
        to="user@example.com",
        subject="Verification",
        html='<a href="https://180days.example/">Open</a>',
        idempotency_key="reminder-user-1-2026-11-17",
    )

    assert email_id == "email_123"
    assert requests == [
        (
            "https://api.resend.com/emails",
            {
                "Authorization": "Bearer re_test_key",
                "Idempotency-Key": "reminder-user-1-2026-11-17",
            },
            {
                "from": "180Days <hello@example.com>",
                "to": ["user@example.com"],
                "subject": "Verification",
                "html": '<a href="https://180days.example/">Open</a>',
            },
        )
    ]


def test_verification_code_email_is_safe_and_includes_expiry(monkeypatch):
    monkeypatch.setattr(emailer, "APP_URL", "https://180days.example")

    subject, html = emailer.verification_code_email("Test User", "004201")

    emailer._assert_safe_email(subject, html)
    assert "004201" in html
    assert "10 minutes" in html
