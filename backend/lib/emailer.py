"""Gmail SMTP email integration — async, non-blocking, and gated.

Guardrails (G1-G5) are enforced by construction: recipients come from server-side user
records (never request input), bodies from the fixed templates below, links point only at
this app's own APP_URL over https, and every send passes _assert_safe_email first.
"""

import asyncio
import hashlib
import ipaddress
import logging
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import HTTPException
from lib.observability import log_event

load_dotenv(Path(__file__).parent.parent / ".env")
logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = os.environ.get("SMTP_PORT", "587").strip()
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip().replace(" ", "")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "").strip()
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "180Days").strip() or "180Days"
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").strip().lower()
APP_URL = os.environ.get("APP_URL", "").rstrip("/")

_SHORTENERS = (
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "is.gd",
    "cutt.ly",
    "goo.gl",
    "rebrand.ly",
)
_CRED_ASK = (
    "reply with your password",
    "reply with the code",
    "send your password",
    "cvv",
    "send us your password",
    "enter your password below",
    "confirm your card number",
    "your full card number",
    "seed phrase",
    "recovery phrase",
    "verify your card",
    "social security number",
    "confirm your bank details",
)  # G2 ask-back phrasing
_HOSTISH = re.compile(
    r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I
)  # host-looking text
_RESERVED_EMAIL_DOMAINS = ("example.com", "example.net", "example.org")


def _host_ok(host: str) -> bool:
    """Reject empty, punycode, IP-literal (v4 AND v6), and shortener hosts."""
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


def _is_test_recipient(address: str) -> bool:
    domain = address.rpartition("@")[2].lower().rstrip(".")
    return domain.endswith((".test", ".invalid", ".localhost")) or any(
        domain == reserved or domain.endswith("." + reserved)
        for reserved in _RESERVED_EMAIL_DOMAINS
    )


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


class _EmailText(HTMLParser):
    _BLOCK_TAGS = {"br", "div", "h1", "h2", "h3", "li", "p", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag, _attrs):
        if tag.lower() in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def _assert_safe_email(subject: str, html: str) -> None:
    """Best-effort structural check for G2 + G3 (defense in depth, NOT G1)."""
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(
                f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)"
            )
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(
                    f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)"
                )


def _plain_text(html: str) -> str:
    parser = _EmailText()
    parser.feed(html)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _smtp_configuration() -> tuple[str, int, str, str, str, str]:
    missing = [
        name
        for name, value in (
            ("SMTP_HOST", SMTP_HOST),
            ("SMTP_USERNAME", SMTP_USERNAME),
            ("SMTP_PASSWORD", SMTP_PASSWORD),
            ("SMTP_FROM_EMAIL", SMTP_FROM_EMAIL),
        )
        if not value
    ]
    try:
        port = int(SMTP_PORT)
    except ValueError:
        port = 0
    if port != 587:
        missing.append("SMTP_PORT")
    if SMTP_USE_TLS not in {"true", "1", "yes"}:
        missing.append("SMTP_USE_TLS")
    app_host = urlparse(APP_URL).hostname
    if (
        not APP_URL.startswith("https://")
        or not app_host
        or app_host in {"localhost", "127.0.0.1", "::1"}
    ):
        missing.append("APP_URL")
    if missing:
        log_event(
            logger,
            logging.WARNING,
            "email.smtp_configuration_missing",
            error_code="smtp_not_configured",
            missing_variables=sorted(set(missing)),
        )
        raise HTTPException(
            status_code=503,
            detail="Email delivery is not configured in this environment.",
        )
    return (
        SMTP_HOST,
        port,
        SMTP_USERNAME,
        SMTP_PASSWORD,
        SMTP_FROM_EMAIL,
        SMTP_FROM_NAME or "180Days",
    )


def _message_id(idempotency_key: str | None) -> str:
    domain = urlparse(APP_URL).hostname or "localhost"
    if idempotency_key:
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()
        return f"<{digest}@{domain}>"
    return make_msgid(domain=domain)


def _send_smtp(
    *,
    to: str,
    subject: str,
    html: str,
    idempotency_key: str | None,
    configuration: tuple[str, int, str, str, str, str],
) -> str:
    host, port, username, password, from_email, from_name = configuration
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((from_name, from_email))
    message["To"] = to
    message["Message-ID"] = _message_id(idempotency_key)
    message.set_content(_plain_text(html))
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP(host, port, timeout=15) as client:
        client.ehlo()
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
        client.login(username, password)
        refused = client.send_message(message)
        if refused:
            raise smtplib.SMTPRecipientsRefused(refused)
    return message["Message-ID"]


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    idempotency_key: str | None = None,
) -> str:
    """Deliver one transactional email over SMTP with STARTTLS."""
    if _is_test_recipient(to):
        log_event(
            logger,
            logging.WARNING,
            "email.reserved_test_recipient",
            error_code="reserved_test_recipient",
            status_code=503,
        )
        raise HTTPException(
            status_code=503,
            detail="Email delivery is unavailable for this address.",
        )
    configuration = _smtp_configuration()
    try:
        _assert_safe_email(subject, html)
    except ValueError as exc:
        log_event(
            logger,
            logging.ERROR,
            "email.template_rejected",
            error_code="invalid_email_template",
            exception_type=type(exc).__name__,
            status_code=502,
        )
        raise HTTPException(
            status_code=502, detail="Unable to prepare email content."
        ) from None

    try:
        return await asyncio.to_thread(
            _send_smtp,
            to=to,
            subject=subject,
            html=html,
            idempotency_key=idempotency_key,
            configuration=configuration,
        )
    except smtplib.SMTPAuthenticationError as exc:
        log_event(
            logger,
            logging.ERROR,
            "email.smtp_authentication_failed",
            error_code="smtp_authentication_failed",
            exception_type=type(exc).__name__,
            status_code=503,
        )
        raise HTTPException(
            status_code=503, detail="Email delivery is temporarily unavailable."
        ) from None
    except (smtplib.SMTPException, OSError, TimeoutError, ssl.SSLError) as exc:
        log_event(
            logger,
            logging.ERROR,
            "email.smtp_delivery_failed",
            error_code="smtp_delivery_failed",
            exception_type=type(exc).__name__,
            status_code=503,
        )
        raise HTTPException(
            status_code=503, detail="Email delivery is temporarily unavailable."
        ) from None


# --- Fixed server-side templates (G4): recipients from user records, never request input ---


def _shell(title: str, body_html: str) -> str:
    return (
        '<table role="presentation" width="100%" style="background:#070E1A;padding:24px">'
        f'<tr><td align="center"><table role="presentation" width="560" '
        'style="background:#0D1B2E;border-radius:16px;padding:32px;font-family:Arial,'
        'Helvetica,sans-serif">'
        '<tr><td style="padding-bottom:8px">'
        '<a href="'
        + APP_URL
        + '/" style="font-size:20px;font-weight:bold;color:#14B8A6;'
        'text-decoration:none">180Days</a></td></tr>'
        f'<tr><td style="font-size:22px;font-weight:bold;color:#F8FAFC;padding-bottom:16px">'
        f"{escape(title)}</td></tr>"
        f'<tr><td style="font-size:15px;line-height:1.6;color:#CBD5E1;padding-bottom:24px">'
        f"{body_html}</td></tr>"
        '<tr><td style="font-size:12px;color:#64748B;border-top:1px solid #1E293B;padding-top:16px">'
        f"Sent by {escape(SMTP_FROM_NAME)}. We never ask for your password or card details "
        "by email.</td></tr>"
        "</table></td></tr></table>"
    )


def _button(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#14B8A6;color:#062018;'
        f'font-weight:bold;padding:12px 24px;border-radius:10px;text-decoration:none">'
        f"{escape(label)}</a>"
    )


def verification_email(name: str, token: str) -> tuple[str, str]:
    subject = "Verify your email — 180Days"
    url = f"{APP_URL}/verify-email?token={token}"
    body = (
        f"<p>Hi {escape(name)}, welcome to 180Days!</p>"
        "<p>Confirm your email address to secure your account and start your 180-day "
        "DSA + MERN journey.</p>"
        f'<p>{_button(url, "Verify my email")}</p>'
        "<p>This link expires in 24 hours. If the button does not work, copy this link into "
        f'your browser:<br><a href="{url}" style="color:#38BDF8;word-break:break-all">{url}</a></p>'
    )
    return subject, _shell("Verify your email", body)


def verification_code_email(name: str, code: str) -> tuple[str, str]:
    subject = "Your 180Days Verification Code"
    safe_name = escape(name)
    safe_code = escape(code)
    app_link = escape(f"{APP_URL}/", quote=True)
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5fb;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5fb;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#101a3a;padding:25px 32px">
          <a href="{app_link}" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:700;letter-spacing:2px">180DAYS</a>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;font-size:16px;line-height:1.6">
          <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#172033">Verify your email</h1>
          <p style="margin:0 0 16px">Hey {safe_name}!</p>
          <p style="margin:0 0 16px">Welcome to 180Days! We're excited to have you on board.</p>
          <p style="margin:0 0 24px">Use the verification code below to verify your email address and secure your account.</p>
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#4b5568">Your verification code:</p>
          <div style="margin:0 0 22px;padding:18px 12px;border-radius:12px;background:#eef0ff;text-align:center">
            <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#3730a3">{safe_code}</span>
          </div>
          <p style="margin:0 0 12px">This code is valid for <strong>10 minutes</strong>. Please don't share it with anyone.</p>
          <p style="margin:0 0 20px;color:#4b5568">If you didn't request this verification code, you can safely ignore this email.</p>
          <p style="margin:0">Keep showing up. Your journey matters.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8f9fd;border-top:1px solid #e8eaf2;font-size:13px;line-height:1.5;color:#596174">
          Team 180Days — Build Your Next 180 Days.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, html


def password_reset_email(name: str, token: str) -> tuple[str, str]:
    subject = "Reset your password — 180Days"
    url = f"{APP_URL}/reset-password?token={token}"
    body = (
        f"<p>Hi {escape(name)},</p>"
        "<p>We received a request to reset the password for your 180Days account.</p>"
        f'<p>{_button(url, "Choose a new password")}</p>'
        "<p>This link expires in 1 hour and can be used once. If you did not request a "
        "reset, you can safely ignore this email — your current password keeps working.</p>"
        f'<p><a href="{url}" style="color:#38BDF8;word-break:break-all">{url}</a></p>'
    )
    return subject, _shell("Reset your password", body)


def daily_reminder_email(
    name: str, day: int, pending: int, date_str: str
) -> tuple[str, str]:
    subject = f"Day {day} is waiting — 180Days"
    url = f"{APP_URL}/daily-tracker?day={day}"
    open_btn = _button(url, "Open today's tracker")
    body = (
        f"<p>Hi {escape(name)},</p>"
        f'<p>Your tracker shows <strong>{pending} pending task{"s" if pending != 1 else ""}</strong> '
        f"for Day {day} ({escape(date_str)}). Keep the streak alive — small daily wins compound "
        "into a finished roadmap.</p>"
        f"<p>{open_btn}</p>"
    )
    return subject, _shell("Daily study reminder", body)
