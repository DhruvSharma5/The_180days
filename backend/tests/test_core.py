"""Core pytest specs: auth flow, journey isolation, future-day lock, admin RBAC.

Runs against the live uvicorn process (see conftest.py). Seed data must exist
(`python seed.py`) — roadmap days are needed for journey start.
"""

import os
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest


def _signup(client, name="Test User", password="Passw0rd123"):
    email = f"t-{uuid.uuid4().hex[:10]}@example.com"
    body = {
        "name": name,
        "email": email,
        "password": password,
        "confirm_password": password,
    }
    r = client.post("/auth/signup", json=body)
    return email, password, r


def _login(client, email, password):
    return client.post(
        "/auth/login", json={"email": email, "password": password, "remember": True}
    )


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_signup_login_me_flow(client):
    email, password, r = _signup(client)
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] == email
    assert r.json()["user"]["role"] == "user"  # signup can never mint an admin
    # duplicate email is rejected
    dup = client.post(
        "/auth/signup",
        json={
            "name": "Other",
            "email": email,
            "password": password,
            "confirm_password": password,
        },
    )
    assert dup.status_code == 409
    # weak password is rejected
    weak = client.post(
        "/auth/signup",
        json={
            "name": "Weak",
            "email": f"t-{uuid.uuid4().hex[:8]}@example.com",
            "password": "short",
            "confirm_password": "short",
        },
    )
    assert weak.status_code == 422
    # login + me (cookie flows automatically through the client jar)
    r = _login(client, email, password)
    assert r.status_code == 200
    assert "sid" in r.headers.get("set-cookie", "").lower() or client.cookies.get("sid")
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email
    # logout clears the session
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401


def test_wrong_password_rejected(client):
    email, _, _ = _signup(client)
    bad = _login(client, email, "WrongPass123")
    assert bad.status_code == 401


def test_email_verification_code_requires_login_and_rejects_invalid_code(client):
    anonymous = client.__class__(base_url=client.base_url)
    assert (
        anonymous.post("/auth/verify-email-code", json={"code": "123456"}).status_code
        == 401
    )

    _, _, signup = _signup(client)
    assert signup.status_code == 201
    invalid = client.post("/auth/verify-email-code", json={"code": "000000"})
    assert invalid.status_code == 400

    resend = client.post("/auth/resend-verification")
    assert resend.status_code == 503


def test_change_password_revokes_other_sessions(client):
    email, password, signup = _signup(client)
    assert signup.status_code == 201
    other_session = client.__class__(base_url=client.base_url)
    assert _login(other_session, email, password).status_code == 200

    changed = client.post(
        "/auth/change-password",
        json={
            "current_password": password,
            "new_password": "NewPassw0rd456",
        },
    )
    assert changed.status_code == 200, changed.text
    assert client.get("/auth/me").status_code == 200  # current session is rotated
    assert other_session.get("/auth/me").status_code == 401

    relogin = other_session.post(
        "/auth/login",
        json={
            "email": email,
            "password": "NewPassw0rd456",
            "remember": True,
        },
    )
    assert relogin.status_code == 200


def test_journey_start_and_isolation(client):
    # User A: signup, start journey, complete a task on day 1
    email_a, pw_a, _ = _signup(client, name="User A")
    _login(client, email_a, pw_a)
    start = client.post(
        "/journey/start", json={"timezone": "Asia/Kolkata", "confirm": True}
    )
    assert start.status_code == 201, start.text
    assert start.json()["journey"]["current_day"] >= 1
    # double start is rejected
    again = client.post(
        "/journey/start", json={"timezone": "Asia/Kolkata", "confirm": True}
    )
    assert again.status_code == 409
    # complete one task on day 1
    day = client.get("/progress/day/1")
    assert day.status_code == 200
    first_key = (
        day.json()["roadmap"]["dsa"][0]["key"]
        if day.json()["roadmap"]["dsa"]
        else day.json()["roadmap"]["revision"][0]["key"]
    )
    saved = client.put(
        "/progress/day/1", json={"tasks": {first_key: {"completed": True}}}
    )
    assert saved.status_code == 200
    assert saved.json()["tasks_done"] == 1
    # persistence: re-read shows it saved
    reget = client.get("/progress/day/1")
    assert reget.json()["progress"]["tasks"][first_key]["completed"] is True

    # User B: separate account — can never see or touch A's data
    other = client.__class__(base_url=client.base_url)
    email_b, pw_b, _ = _signup(other, name="User B")
    _login(other, email_b, pw_b)
    cal = other.get("/progress/calendar")
    assert cal.status_code == 404  # B has no journey
    summary_b = other.get("/progress/summary")
    assert summary_b.status_code == 200
    assert summary_b.json()["journey_status"] == "not_started"
    assert summary_b.json()["overall"]["done"] == 0  # A's completion does not leak
    # future days are locked for A
    fut = client.put(
        "/progress/day/5", json={"tasks": {first_key: {"completed": True}}}
    )
    assert fut.status_code == 422


def test_journey_can_be_scheduled_for_a_future_date(client):
    email, password, signup = _signup(client)
    assert signup.status_code == 201
    assert _login(client, email, password).status_code == 200

    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    past = (today - timedelta(days=1)).isoformat()
    rejected = client.post(
        "/journey/start",
        json={"timezone": "Asia/Kolkata", "start_date": past, "confirm": True},
    )
    assert rejected.status_code == 422

    future = (today + timedelta(days=3)).isoformat()
    started = client.post(
        "/journey/start",
        json={"timezone": "Asia/Kolkata", "start_date": future, "confirm": True},
    )
    assert started.status_code == 201, started.text
    assert started.json()["journey"]["start_date"] == future
    assert started.json()["journey"]["current_day"] == 0
    day = client.get("/progress/day/1")
    assert day.status_code == 200
    task_key = day.json()["roadmap"]["dsa"][0]["key"]
    locked = client.put(
        "/progress/day/1", json={"tasks": {task_key: {"completed": True}}}
    )
    assert locked.status_code == 422


def test_mock_upsert_and_validation(client):
    email, pw, _ = _signup(client)
    _login(client, email, pw)
    r = client.put("/mocks/week/3", json={"score": 5})
    assert r.status_code == 200
    assert r.json()["score"] == 5
    bad = client.put("/mocks/week/3", json={"score": 9})
    assert bad.status_code == 422


def test_analytics_event_ingestion(client):
    r = client.post(
        "/analytics/event",
        json={
            "type": "page_view",
            "session_id": f"sess-{uuid.uuid4().hex[:12]}",
            "path": "/login",
        },
    )
    assert r.status_code == 204


def test_regular_user_cannot_access_admin(client):
    email, password, signup = _signup(client)
    assert signup.status_code == 201
    assert _login(client, email, password).status_code == 200
    assert client.get("/admin/overview").status_code == 403


def test_admin_rbac(client, aclient):
    if not os.environ.get("ADMIN_EMAIL") or not os.environ.get("ADMIN_PASSWORD"):
        pytest.skip("Admin credentials are not configured in this local environment")
    # normal user is denied admin routes (403 — role is known, action denied)
    email, pw, _ = _signup(client)
    _login(client, email, pw)
    denied = client.get("/admin/overview")
    assert denied.status_code == 403
    assert client.get("/admin/users").status_code == 403
    # admin account (env credentials, seeded server-side) is allowed
    admin_email = os.environ["ADMIN_EMAIL"]
    admin_pw = os.environ["ADMIN_PASSWORD"]
    admin_client = client.__class__(base_url=client.base_url)
    r = admin_client.post(
        "/auth/login",
        json={"email": admin_email, "password": admin_pw, "remember": True},
    )
    assert r.status_code == 200
    overview = admin_client.get("/admin/overview")
    assert overview.status_code == 200
    assert overview.json()["total_users"] >= 2
    assert admin_client.get("/admin/users").status_code == 200
    analytics = admin_client.get("/admin/analytics?range=7d")
    assert analytics.status_code == 200
    assert {"visits", "unique_visitors", "page_views"} <= set(analytics.json().keys())
    # non-admin cannot edit the roadmap
    edit = client.put("/admin/roadmap/day/1", json={"title": "hacked"})
    assert edit.status_code == 403
