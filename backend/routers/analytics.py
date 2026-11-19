"""Privacy-conscious, first-party analytics ingestion.

Anonymous visits are separate from accounts: the event endpoint is public, stores no IP
and no PII, and only links a user_id when the caller is already signed in (to power DAU).
Recipients of analytics reads are admins only (see routers/admin.py).
"""

import re

from fastapi import APIRouter, Request

from lib.auth import client_ip, decode_token, rate_limit, SESSION_COOKIE
from lib.db import db
from models.models import AnalyticsEventIn, utcnow

router = APIRouter(prefix="/analytics", tags=["analytics"])

TABLET_RE = re.compile(r"ipad|tablet|kindle|silk", re.I)
MOBILE_RE = re.compile(r"mobi|iphone|android|phone", re.I)
BROWSERS = [("edg", "Edge"), ("opr", "Opera"), ("firefox", "Firefox"),
            ("chrome", "Chrome"), ("safari", "Safari")]


def parse_ua(ua: str) -> tuple[str, str]:
    device = "tablet" if TABLET_RE.search(ua) else "mobile" if MOBILE_RE.search(ua) else "desktop"
    browser = "Other"
    low = ua.lower()
    for needle, name in BROWSERS:
        if needle in low:
            if name == "Safari" and "chrome" in low:
                browser = "Chrome"
            else:
                browser = name
            break
    return device, browser


@router.post("/event", status_code=204)
async def track_event(body: AnalyticsEventIn, request: Request):
    rate_limit("event", request)
    ua = request.headers.get("user-agent", "")
    device, browser = parse_ua(ua)
    now = utcnow()
    user_id = None
    token = request.cookies.get(SESSION_COOKIE)
    if token and (claims := decode_token(token)) and claims.get("typ") == "session":
        user_id = claims.get("sub")
    is_new = True
    if body.type == "visit":
        earlier = await db.analytics_events.find_one(
            {"session_id": body.session_id, "type": "visit", "date": {"$ne": now.strftime("%Y-%m-%d")}},
            {"_id": 1},
        )
        is_new = earlier is None
    event = {
        "type": body.type, "session_id": body.session_id, "user_id": user_id,
        "path": (body.path or "/")[:300], "referrer": (body.referrer or "")[:300],
        "device": device, "browser": browser,
        "screen": f"{body.screen_w or 0}x{body.screen_h or 0}",
        "ts": now, "date": now.strftime("%Y-%m-%d"), "is_new": is_new,
    }
    try:
        await db.analytics_events.insert_one(event)
    except Exception:
        # Duplicate visit for the same session+day: exactly-once dedupe, not an error.
        pass
    return None
