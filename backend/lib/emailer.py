"""Direct Resend email integration — async, non-blocking, and gated.

Guardrails (G1-G5) are enforced by construction: recipients come from server-side user
records (never request input), bodies from the fixed templates below, links point only at
this app's own APP_URL over https, and every send passes _assert_safe_email first.
"""

import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv(Path(__file__).parent.parent / ".env")
logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
FROM_EMAIL = os.environ.get("FROM_EMAIL", "").strip()
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "180Days")
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


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    idempotency_key: str | None = None,
) -> str | None:
    """Send one transactional email through Resend; return None when unconfigured."""
    if (
        not APP_URL.startswith("https://")
        or urlparse(APP_URL).hostname in {"localhost", "127.0.0.1", "::1"}
        or not RESEND_API_KEY
        or not FROM_EMAIL
    ):
        logger.warning(
            "Email skipped: HTTPS app URL, Resend key, or sender is not configured"
        )
        return None
    _assert_safe_email(subject, html)  # G2-G3 gate — never skip for an actual send
    payload = {
        "from": FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    headers = {"Authorization": f"Bearer {RESEND_API_KEY}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(RESEND_API_URL, headers=headers, json=payload)
        resp.raise_for_status()
        result = resp.json()
        if not isinstance(result, dict) or not isinstance(result.get("id"), str):
            logger.error("Resend returned a successful response without an email id")
            raise HTTPException(
                status_code=502, detail="Invalid email provider response"
            )
        return result["id"]
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 429 or status >= 500:
            logger.warning("Resend temporarily unavailable (HTTP %s)", status)
            raise HTTPException(
                status_code=503, detail="Email is temporarily unavailable"
            ) from exc
        logger.error("Resend rejected an email request (HTTP %s)", status)
        raise HTTPException(status_code=502, detail="Failed to send email")
    except httpx.RequestError as exc:
        logger.error("Resend request failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503, detail="Email is temporarily unavailable"
        ) from exc
    except HTTPException:
        raise
    except ValueError as exc:
        logger.error("Resend returned invalid JSON")
        raise HTTPException(
            status_code=502, detail="Invalid email provider response"
        ) from exc


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
        f"Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password or card details "
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
    subject = "Your 180Days verification code"
    body = (
        f"<p>Hi {escape(name)}, welcome to 180Days!</p>"
        "<p>Enter this one-time code to verify your email address:</p>"
        f'<p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#14B8A6">'
        f"{escape(code)}</p>"
        "<p>This code expires in 10 minutes and can only be used once. "
        "If you did not create an account, you can ignore this email.</p>"
    )
    return subject, _shell("Verify your email", body)


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
