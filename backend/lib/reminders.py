"""Daily reminder dispatch — shared by the admin trigger and the platform cron.

Emails go only to users who opted in (notify_daily), with an active journey and
pending tasks on their current day. Billing/provider failures are caught per-user.
"""

import asyncio
import logging

from fastapi import HTTPException

from lib.db import db
from lib.emailer import daily_reminder_email, send_email
from lib.journey import today_in_tz

logger = logging.getLogger(__name__)


async def dispatch_daily_reminders() -> tuple[int, int]:
    """Send reminders; returns (sent, skipped). Never raises — logs per-user failures."""
    users = await db.users.find(
        {"notify_daily": True, "role": "user"},
        {"_id": 0, "id": 1, "name": 1, "email": 1},
    ).to_list(500)
    sent, skipped = 0, 0
    for u in users:
        journey = await db.journeys.find_one({"user_id": u["id"]}, {"_id": 0})
        if not journey or journey.get("status") != "active":
            skipped += 1
            continue
        from datetime import datetime
        start = datetime.strptime(journey["start_date"], "%Y-%m-%d").date()
        tz = journey.get("timezone", "UTC")
        today = today_in_tz(tz)
        delta = (today - start).days + 1
        day = max(0, min(180, delta))
        if day < 1:
            skipped += 1
            continue
        doc = await db.task_progress.find_one({"user_id": u["id"], "day": day}, {"_id": 0})
        pending = (doc.get("tasks_total", 0) - doc.get("tasks_done", 0)) if doc else 0
        if pending <= 0:
            skipped += 1
            continue
        try:
            subject, html = daily_reminder_email(
                u["name"], day, pending, today.strftime("%d %b %Y"))
            email_id = await send_email(
                to=u["email"],
                subject=subject,
                html=html,
                idempotency_key=f"daily-reminder-{u['id']}-{today.isoformat()}",
            )
            if email_id:
                sent += 1
            else:
                skipped += 1
        except HTTPException as exc:
            logger.warning("Reminder skipped for %s: %s", u.get("email"), exc.detail)
            skipped += 1
        await asyncio.sleep(0.05)
    return sent, skipped
