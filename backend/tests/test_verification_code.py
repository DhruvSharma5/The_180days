from collections import deque
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response

from lib.auth import _BUCKETS, verification_code_hash, verify_password
from routers import auth


class FakeEmailTokens:
    def __init__(self):
        self.docs = []

    async def update_many(self, query, update):
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                doc.update(update["$set"])

    async def insert_one(self, doc):
        self.docs.append(doc.copy())

    async def find_one_and_update(self, query, update):
        for doc in self.docs:
            matched = True
            for key, value in query.items():
                if key == "expires_at":
                    matched = doc[key] > value["$gt"]
                else:
                    matched = doc.get(key) == value
                if not matched:
                    break
            if matched:
                doc.update(update["$set"])
                return doc.copy()
        return None


class FakeUsers:
    def __init__(self):
        self.updates = []
        self.user = {
            "id": "user-1",
            "name": "Test User",
            "email": "user@example.com",
            "password_hash": auth.hash_password("OldPassw0rd"),
            "session_epoch": 0,
        }

    async def find_one(self, query, *_):
        return self.user.copy() if query.get("email") == self.user["email"] else None

    async def update_one(self, query, update):
        self.updates.append((query, update))
        if "$set" in update:
            self.user.update(update["$set"])
        if "$inc" in update:
            for key, value in update["$inc"].items():
                self.user[key] = self.user.get(key, 0) + value


def _request(client_host="127.0.0.2"):
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/verify-email-code",
            "headers": [],
            "query_string": b"",
            "client": (client_host, 12345),
            "server": ("localhost", 8001),
            "scheme": "http",
            "http_version": "1.1",
        }
    )


@pytest.mark.asyncio
async def test_verification_code_is_hashed_rotated_and_single_use(monkeypatch):
    tokens = FakeEmailTokens()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)

    old_code = await auth.issue_verification_code("user-1")
    issued_at = datetime.now(timezone.utc)
    new_code = await auth.issue_verification_code("user-1")

    assert len(new_code) == 6 and new_code.isdigit()
    assert tokens.docs[0]["token_hash"] == verification_code_hash(old_code)
    assert tokens.docs[0]["used"] is True
    assert tokens.docs[1]["token_hash"] == verification_code_hash(new_code)
    remaining = tokens.docs[1]["expires_at"] - issued_at
    assert (
        timedelta(minutes=9, seconds=59)
        <= remaining
        <= timedelta(minutes=10, seconds=1)
    )
    assert await auth.consume_verification_code("user-1", old_code) is None
    assert await auth.consume_verification_code("user-1", new_code) is not None
    assert await auth.consume_verification_code("user-1", new_code) is None

    expired_code = await auth.issue_verification_code("user-1")
    tokens.docs[-1]["expires_at"] = datetime.now(timezone.utc)
    assert await auth.consume_verification_code("user-1", expired_code) is None


@pytest.mark.asyncio
async def test_verification_code_cannot_be_used_for_another_account(monkeypatch):
    tokens = FakeEmailTokens()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)

    code = await auth.issue_verification_code("user-1")

    assert await auth.consume_verification_code("user-2", code) is None
    assert await auth.consume_verification_code("user-1", code) is not None


@pytest.mark.asyncio
async def test_verification_code_rejects_an_incorrect_value(monkeypatch):
    tokens = FakeEmailTokens()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "123456")

    await auth.issue_verification_code("user-1")

    assert await auth.consume_verification_code("user-1", "654321") is None


@pytest.mark.asyncio
async def test_login_requires_verified_otp_before_creating_session(monkeypatch):
    tokens = FakeEmailTokens()
    users = FakeUsers()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth.db, "users", users)
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "123456")
    monkeypatch.setitem(_BUCKETS, ("login", "127.0.0.2"), deque())
    monkeypatch.setitem(_BUCKETS, ("verify", "127.0.0.2"), deque())
    sent = []

    async def capture_email(**kwargs):
        sent.append(kwargs)
        return "mock-login-email"

    monkeypatch.setattr(auth, "send_email", capture_email)
    request = _request()
    response = Response()

    challenge = await auth.login(
        auth.LoginIn(
            email="user@example.com",
            password="OldPassw0rd",
            remember=True,
        ),
        request,
    )

    assert challenge.email == "user@example.com"
    assert "Sign-in verification code" in challenge.message
    assert len(sent) == 1
    assert "123456" in sent[0]["html"]
    assert len(tokens.docs) == 1
    assert tokens.docs[0]["purpose"] == "login"
    assert tokens.docs[0]["token_hash"] == verification_code_hash("123456")

    verified = await auth.verify_login_code(
        auth.LoginVerifyIn(
            email="user@example.com",
            code="123456",
            remember=True,
        ),
        request,
        response,
    )

    assert verified.user.email_verified is True
    assert users.user["email_verified"] is True
    assert "sid=" in response.headers["set-cookie"]


@pytest.mark.asyncio
async def test_login_rejects_incorrect_otp(monkeypatch):
    tokens = FakeEmailTokens()
    users = FakeUsers()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth.db, "users", users)
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "123456")
    monkeypatch.setitem(_BUCKETS, ("login", "127.0.0.2"), deque())
    monkeypatch.setitem(_BUCKETS, ("verify", "127.0.0.2"), deque())

    async def capture_email(**kwargs):
        return "mock-login-email"

    monkeypatch.setattr(auth, "send_email", capture_email)
    await auth.login(
        auth.LoginIn(
            email="user@example.com",
            password="OldPassw0rd",
            remember=True,
        ),
        _request(),
    )

    with pytest.raises(HTTPException) as exc_info:
        await auth.verify_login_code(
            auth.LoginVerifyIn(
                email="user@example.com",
                code="654321",
                remember=True,
            ),
            _request(),
            Response(),
        )

    assert exc_info.value.status_code == 400

@pytest.mark.asyncio
async def test_resend_verification_is_rate_limited(monkeypatch):
    tokens = FakeEmailTokens()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth, "send_email", _email_disabled)
    monkeypatch.setitem(_BUCKETS, ("resend", "127.0.0.2"), deque())
    user = auth.User(
        id="user-1",
        email="user@example.com",
        name="Test User",
        role="user",
        email_verified=False,
        timezone="UTC",
    )

    for _ in range(3):
        with pytest.raises(HTTPException) as exc_info:
            await auth.resend_verification(_request(), user)
        assert exc_info.value.status_code == 503

    with pytest.raises(HTTPException) as exc_info:
        await auth.resend_verification(_request(), user)
    assert exc_info.value.status_code == 429
    assert tokens.docs == []


@pytest.mark.asyncio
async def test_resend_stores_code_after_delivery_without_returning_otp(monkeypatch):
    tokens = FakeEmailTokens()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setitem(_BUCKETS, ("resend", "127.0.0.2"), deque())
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "654321")
    old_code = await auth.issue_verification_code("user-1")
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "123456")
    user = auth.User(
        id="user-1",
        email="user@example.com",
        name="Test User",
        role="user",
        email_verified=False,
        timezone="UTC",
    )

    async def email_after_code_generation(**kwargs):
        assert len(tokens.docs) == 1
        assert tokens.docs[0]["used"] is False
        assert "123456" in kwargs["html"]
        return "mock-email-id"

    monkeypatch.setattr(auth, "send_email", email_after_code_generation)
    response = await auth.resend_verification(_request(), user)

    assert response.model_dump() == {
        "message": "Verification email sent — check your inbox."
    }
    assert "123456" not in str(response)
    assert tokens.docs[0]["token_hash"] == verification_code_hash(old_code)
    assert tokens.docs[0]["used"] is True
    assert tokens.docs[1]["token_hash"] == verification_code_hash("123456")
    assert tokens.docs[1]["used"] is False
    assert await auth.consume_verification_code("user-1", old_code) is None
    assert await auth.consume_verification_code("user-1", "123456") is not None


@pytest.mark.asyncio
async def test_resend_delivery_failure_keeps_previous_code_usable_and_hides_otp(
    monkeypatch, caplog
):
    tokens = FakeEmailTokens()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "654321")
    old_code = await auth.issue_verification_code("user-1")
    monkeypatch.setattr(auth, "generate_verification_code", lambda: "123456")
    monkeypatch.setattr(auth, "send_email", _email_disabled)
    monkeypatch.setitem(_BUCKETS, ("resend", "127.0.0.2"), deque())
    user = auth.User(
        id="user-1",
        email="user@example.com",
        name="Test User",
        role="user",
        email_verified=False,
        timezone="UTC",
    )

    with caplog.at_level("WARNING", logger="routers.auth"):
        with pytest.raises(HTTPException) as exc_info:
            await auth.resend_verification(_request(), user)

    assert exc_info.value.status_code == 503
    assert "123456" not in caplog.text
    assert "123456" not in str(exc_info.value.detail)
    assert len(tokens.docs) == 1
    assert tokens.docs[0]["token_hash"] == verification_code_hash(old_code)
    assert tokens.docs[0]["used"] is False
    assert await auth.consume_verification_code("user-1", old_code) is not None


async def _email_disabled(**_):
    raise HTTPException(
        status_code=503, detail="Email delivery is temporarily unavailable."
    )


@pytest.mark.asyncio
async def test_forgot_password_issues_single_use_reset_and_changes_password(
    monkeypatch,
):
    tokens = FakeEmailTokens()
    users = FakeUsers()
    emails = []
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth.db, "users", users)
    monkeypatch.setitem(_BUCKETS, ("forgot", "127.0.0.2"), deque())

    async def capture_email(**kwargs):
        emails.append(kwargs)
        return "mock-email-id"

    monkeypatch.setattr(auth, "send_email", capture_email)

    response = await auth.forgot_password(
        auth.ForgotIn(email="user@example.com"), _request()
    )
    assert "If an account exists" in response.message
    assert len(emails) == 1
    raw_token = emails[0]["html"].split("/reset-password?token=")[1].split('"')[0]

    reset = await auth.reset_password(
        auth.ResetIn(token=raw_token, password="NewPassw0rd456")
    )
    assert "Password updated" in reset.message
    assert verify_password("NewPassw0rd456", users.user["password_hash"])
    assert users.user["session_epoch"] == 1

    with pytest.raises(HTTPException) as exc_info:
        await auth.reset_password(
            auth.ResetIn(token=raw_token, password="AnotherPassw0rd")
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_verification_endpoint_activates_only_authenticated_user(monkeypatch):
    tokens = FakeEmailTokens()
    users = FakeUsers()
    monkeypatch.setattr(auth.db, "email_tokens", tokens)
    monkeypatch.setattr(auth.db, "users", users)
    code = await auth.issue_verification_code("user-1")
    user = auth.User(
        id="user-1",
        email="user@example.com",
        name="Test User",
        role="user",
        email_verified=False,
        timezone="UTC",
    )

    result = await auth.verify_email_code(
        auth.VerificationCodeIn(code=code), _request(), user
    )

    assert result.message == "Email verified — your account is fully activated."
    assert users.updates == [({"id": "user-1"}, {"$set": {"email_verified": True}})]
    with pytest.raises(HTTPException) as exc_info:
        await auth.verify_email_code(
            auth.VerificationCodeIn(code=code), _request(), user
        )
    assert exc_info.value.status_code == 400
