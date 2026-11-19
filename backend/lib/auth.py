"""Auth primitives: bcrypt hashing, JWT session cookies, dependencies, rate limiting.

Sessions are httpOnly cookies (SameSite=Lax, Secure when APP_URL is https) — tokens never
appear in JSON bodies and never touch localStorage. Role is re-read from the DB on every
request (never trusted from the token claims), so a revoked role stops working immediately.
"""

import hashlib
import hmac
import ipaddress
import os
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext
from pydantic import BaseModel

load_dotenv()
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
SESSION_COOKIE = "sid"
DEFAULT_SESSION_DAYS = 7
REMEMBER_SESSION_DAYS = 30
REFRESH_THRESHOLD = timedelta(hours=24)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def create_session_token(
    user_id: str,
    remember: bool = False,
    session_epoch: int = 0,
) -> tuple[str, int]:
    days = REMEMBER_SESSION_DAYS if remember else DEFAULT_SESSION_DAYS
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=days),
        "typ": "session",
        "remember": remember,
        "session_epoch": session_epoch,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG), days * 24 * 3600


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


def cookie_secure(request: Request | None = None) -> bool:
    """Secure flag only when the deployment is https AND the caller is not on
    localhost — keeps the plain-http test lane working without weakening prod."""
    if not os.environ.get("APP_URL", "").startswith("https"):
        return False
    if request is None:
        return True
    host = (request.headers.get("host") or "").lower()
    return "localhost" not in host and "127.0.0.1" not in host


def set_session_cookie(
    response: Response, token: str, max_age: int, request: Request | None = None
) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(request),
        path="/",
    )


def clear_session_cookie(response: Response, request: Request | None = None) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", secure=cookie_secure(request), samesite="lax"
    )


class User(BaseModel):
    """The authenticated principal, re-derived from the DB on every request."""

    id: str
    name: str
    email: str
    role: str
    email_verified: bool
    timezone: str


def token_sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verification_code_hash(code: str) -> str:
    return hmac.new(JWT_SECRET.encode(), code.encode(), hashlib.sha256).hexdigest()


def new_token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex


async def get_current_user(request: Request, response: Response) -> User:
    """Auth dependency — decode the session cookie, re-read the user from Mongo."""
    from lib.db import db  # local import avoids a circular import at module load

    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    claims = decode_token(token)
    if not claims or claims.get("typ") != "session":
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"id": claims["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    if claims.get("session_epoch", 0) != user.get("session_epoch", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    # Sliding refresh: keep active sessions alive without a separate refresh endpoint.
    try:
        iat = datetime.fromtimestamp(int(claims["iat"]), tz=timezone.utc)
    except Exception:
        iat = None
    if iat and datetime.now(timezone.utc) - iat > REFRESH_THRESHOLD:
        fresh, max_age = create_session_token(
            user["id"],
            remember=bool(claims.get("remember", False)),
            session_epoch=user.get("session_epoch", 0),
        )
        set_session_cookie(response, fresh, max_age, request)
    return User(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        role=user.get("role", "user"),
        email_verified=user.get("email_verified", False),
        timezone=user.get("timezone", "UTC"),
    )


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# --- Rate limiting: in-memory sliding window (per instance; swap for Redis when scaling out) ---
_WINDOWS = {
    "login": (30, 300),
    "signup": (30, 3600),
    "forgot": (20, 3600),
    "verify": (10, 900),
    "resend": (3, 3600),
    "event": (240, 60),
}
_BUCKETS: dict[tuple[str, str], deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    try:
        return ipaddress.ip_address(
            request.client.host or "unknown"
        ).exploded  # normalise
    except (ValueError, AttributeError):
        return "unknown"


def rate_limit(kind: str, request: Request) -> None:
    """Raise 429 when this IP exceeds the window for `kind`. Also used to soft-limit."""
    limit, window = _WINDOWS[kind]
    key = (kind, client_ip(request))
    now = time.monotonic()
    bucket = _BUCKETS[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=429, detail="Too many requests — try again later"
        )
    bucket.append(now)
