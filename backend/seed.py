"""Idempotent seed: master roadmap (180 days + 28 interview days), the owner's admin
account (from ADMIN_EMAIL/ADMIN_PASSWORD in .env — never creatable via signup), and a
demo user with a real started journey for immediate exploration.

Run: cd /app/backend && python seed.py
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from lib.auth import hash_password
from lib.db import db, ensure_indexes
from lib.journey import utcnow
from lib.roadmap import build as build_roadmap


def _aware(dt: datetime | None) -> datetime | None:
    """Normalize naive Mongo datetimes before Pydantic serializes them."""
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def seed_roadmap() -> None:
    """Always refresh the master roadmap from the parsed planner JSON (idempotent)."""
    data = build_roadmap()
    days = data["days"]
    assert len(days) == 180, f"expected 180 days, got {len(days)}"
    await db.roadmap_days.delete_many({})
    await db.roadmap_days.insert_many([dict(d) for d in days])
    await db.interview_days.delete_many({})
    await db.interview_days.insert_many([dict(d) for d in data["interview_days"]])
    print(f"seeded roadmap from planner PDF: {len(days)} days, "
          f"{len(data['interview_days'])} interview days, "
          f"{sum(len(d['dsa']) for d in days)} DSA problems, "
          f"{sum(len(d['mern']) for d in days)} MERN blocks, "
          f"{sum(len(d['revision']) for d in days)} revision/evening items")


async def seed_admin() -> None:
    email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not email or not password:
        print("ADMIN_EMAIL/ADMIN_PASSWORD missing in .env — admin not created")
        return
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        await db.users.update_one({"email": email},
                                  {"$set": {"role": "admin", "email_verified": True}})
        print(f"admin refreshed: {email}")
        return
    await db.users.insert_one({
        "id": uuid.uuid4().hex,
        "name": "Owner",
        "email": email,
        "password_hash": hash_password(password),
        "role": "admin",
        "email_verified": True,
        "timezone": os.environ.get("APP_TZ", "UTC"),
        "notify_daily": False, "notify_incomplete": False,
        "notify_weekly": False, "notify_monthly": False,
        "session_epoch": 0,
        "created_at": utcnow(),
        "last_login_at": None,
    })
    print(f"admin created: {email}")


async def seed_demo_user() -> None:
    """Demo account always presents a FRESH journey at Day 1 (today).

    If the demo user exists, its seeded journey/progress/mock records are reset so the
    demo starts at Day 1 — real users' accounts and progress are never touched.
    """
    email = "demo@180days.app"
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()  # demo journey lives in IST
    user_id = None
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["id"]
        for coll in ("task_progress", "weekly_mocks", "weekly_revisions",
                     "monthly_checkpoints", "projects", "journeys"):
            await db[coll].delete_many({"user_id": user_id})
        print("demo user found — reset to a fresh Day-1 journey")
    else:
        user_id = uuid.uuid4().hex
        await db.users.insert_one({
            "id": user_id,
            "name": "Demo Learner",
            "email": email,
            "password_hash": hash_password("Demo1234"),
            "role": "user",
            "email_verified": True,
            "timezone": "Asia/Kolkata",
            "notify_daily": False, "notify_incomplete": False,
            "notify_weekly": False, "notify_monthly": False,
            "session_epoch": 0,
            "created_at": utcnow(),
            "last_login_at": None,
        })
    start = today  # already a datetime.date in Asia/Kolkata
    await db.journeys.insert_one({
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "start_date": start.strftime("%Y-%m-%d"),
        "timezone": "Asia/Kolkata",
        "status": "active",
        "paused_at": None,
        "started_at": utcnow(),
    })
    await init_demo_projects(user_id)
    print(f"demo user ready: {email} / Demo1234 — journey starts TODAY, Day 1 (no pre-seeded progress)")


async def init_demo_projects(user_id: str) -> None:
    data = build_roadmap()
    for tpl in data["projects"]:
        await db.projects.insert_one({
            "id": uuid.uuid4().hex, "user_id": user_id, "key": tpl["key"],
            "title": tpl["title"], "description": tpl["description"], "due_day": tpl["due_day"],
            "milestones": [{"id": f"s{i + 1}", "title": m, "done": False}
                           for i, m in enumerate(tpl.get("milestones", []))],
            "github_url": "", "live_url": "", "status": "not_started",
            "completion_date": "", "notes": "", "updated_at": None,
        })


async def main() -> None:
    await ensure_indexes()
    await seed_roadmap()
    await seed_admin()
    await seed_demo_user()
    print("seed complete")


if __name__ == "__main__":
    asyncio.run(main())
