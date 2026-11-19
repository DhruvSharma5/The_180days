from datetime import timedelta

import pytest
from fastapi import HTTPException

from lib import reminders
from lib.journey import today_in_tz
from routers import cron


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, length):
        return self.documents[:length]


class Users:
    def __init__(self, documents):
        self.documents = documents

    def find(self, *_):
        return Cursor(self.documents)


class UserDocuments:
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, query, *_):
        return self.documents.get(query["user_id"])


@pytest.mark.asyncio
async def test_daily_reminders_only_send_for_active_users_with_pending_tasks(
    monkeypatch,
):
    yesterday = (today_in_tz("UTC") - timedelta(days=1)).isoformat()
    monkeypatch.setattr(
        reminders.db,
        "users",
        Users(
            [
                {"id": "ready", "name": "Ready", "email": "ready@example.test"},
                {"id": "paused", "name": "Paused", "email": "paused@example.test"},
                {
                    "id": "complete",
                    "name": "Complete",
                    "email": "complete@example.test",
                },
                {"id": "none", "name": "No journey", "email": "none@example.test"},
            ]
        ),
    )
    monkeypatch.setattr(
        reminders.db,
        "journeys",
        UserDocuments(
            {
                "ready": {
                    "status": "active",
                    "start_date": yesterday,
                    "timezone": "UTC",
                },
                "paused": {
                    "status": "paused",
                    "start_date": yesterday,
                    "timezone": "UTC",
                },
                "complete": {
                    "status": "active",
                    "start_date": yesterday,
                    "timezone": "UTC",
                },
            }
        ),
    )
    monkeypatch.setattr(
        reminders.db,
        "task_progress",
        UserDocuments(
            {
                "ready": {"tasks_total": 3, "tasks_done": 1},
                "complete": {"tasks_total": 3, "tasks_done": 3},
            }
        ),
    )
    sent = []

    async def fake_send_email(**kwargs):
        sent.append(kwargs)
        return "email-ready"

    monkeypatch.setattr(reminders, "send_email", fake_send_email)

    result = await reminders.dispatch_daily_reminders()

    assert result == (1, 3)
    assert len(sent) == 1
    assert sent[0]["to"] == "ready@example.test"
    assert sent[0]["idempotency_key"].startswith("daily-reminder-ready-")


def test_cron_endpoint_requires_bearer_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-only-cron-secret")

    cron._auth("Bearer test-only-cron-secret")

    with pytest.raises(HTTPException) as exc_info:
        cron._auth("Bearer wrong")
    assert exc_info.value.status_code == 401
