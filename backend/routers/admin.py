"""Admin-only surface: traffic/user analytics with date filters, CSV export,
paginated user list, roadmap editing, manual reminder dispatch.

Every route requires role == "admin", re-derived from the DB on each request — a normal
user can never reach any of this, with or without the URL.
"""

import csv
import io
import math
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from lib import roadmap_store
from lib.auth import User, require_admin
from lib.db import db
from lib.reminders import dispatch_daily_reminders
from models.models import (AdminAnalyticsOut, AdminOverviewOut, AdminUserRow, AdminUsersOut,
                           MessageOut, RoadmapDayUpdateIn, utcnow)
from routers.roadmap import day_out

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

RANGES = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30),
          "90d": timedelta(days=90)}


def _window(a_range: str, from_date: str | None, to_date: str | None) -> tuple[datetime, datetime, str, str, str]:
    now = datetime.now(timezone.utc)
    if a_range == "custom":
        try:
            start = datetime.strptime(from_date or (now - timedelta(days=7)).strftime("%Y-%m-%d"), "%Y-%m-%d")
            end = datetime.strptime(to_date or now.strftime("%Y-%m-%d"), "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD")
        end = end + timedelta(days=1)  # inclusive end date
        if end - start > timedelta(days=366):
            raise HTTPException(status_code=422, detail="Custom range is limited to 366 days")
        return start, end, start.strftime("%Y-%m-%d"), to_date or now.strftime("%Y-%m-%d"), "day"
    if a_range == "24h":
        start = now - timedelta(hours=24)
        return start, now, (now - timedelta(hours=24)).strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d"), "hour"
    delta = RANGES[a_range]
    start = now - delta
    return start, now, start.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d"), "day"


def _bucket(date_str: str, hour: int, bucketing: str) -> str:
    return f"{date_str} {hour:02d}:00" if bucketing == "hour" else date_str


@router.get("/analytics", response_model=AdminAnalyticsOut)
async def analytics(a_range: str = "7d", from_date: str | None = None, to_date: str | None = None):
    start, end, from_s, to_s, bucketing = _window(a_range, from_date, to_date)
    match = {"ts": {"$gte": start, "$lte": end}}
    visits_total = await db.analytics_events.count_documents({"type": "visit", **match})
    views_total = await db.analytics_events.count_documents({"type": "page_view", **match})
    unique_visitors = len(await db.analytics_events.distinct("session_id", {"type": "visit", **match}))
    new_visitors = len(await db.analytics_events.distinct(
        "session_id", {"type": "visit", "is_new": True, **match}))
    returning = max(0, unique_visitors - new_visitors)

    series_pipeline = [
        {"$match": match},
        {"$group": {"_id": {"date": "$date", "hour": {"$hour": "$ts"}, "type": "$type"},
                    "count": {"$sum": 1},
                    "sessions": {"$addToSet": "$session_id"},
                    "users": {"$addToSet": "$user_id"}}},
    ]
    series_cursor = await db.analytics_events.aggregate(series_pipeline)
    raw = await series_cursor.to_list(5000)
    series_map: dict[str, dict] = {}
    for row in raw:
        key = _bucket(row["_id"]["date"], row["_id"]["hour"], bucketing)
        slot = series_map.setdefault(key, {"bucket": key, "visits": 0, "views": 0,
                                           "unique_visitors": 0, "users": set(), "sessions": set()})
        sessions = set(s for s in row["sessions"] if s)
        users = set(u for u in row["users"] if u)
        if row["_id"]["type"] == "visit":
            slot["visits"] += row["count"]
            slot["sessions"] |= sessions
        else:
            slot["views"] += row["count"]
            slot["sessions"] |= sessions
        slot["users"] |= users
    series = sorted(
        ({"bucket": s["bucket"], "visits": s["visits"], "views": s["views"],
          "unique_visitors": len(s["sessions"]), "active_users": len(s["users"])}
         for s in series_map.values()),
        key=lambda r: r["bucket"],
    )

    async def breakdown(field: str) -> list[dict]:
        cursor = await db.analytics_events.aggregate(
            [
                {"$match": match},
                {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 8},
            ]
        )
        rows = await cursor.to_list(20)
        return [{"name": r["_id"] or "Unknown", "count": r["count"]} for r in rows]

    pages_cursor = await db.analytics_events.aggregate(
        [
            {"$match": {"type": "page_view", **match}},
            {"$group": {"_id": "$path", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
    )
    top_pages = await pages_cursor.to_list(20)

    return AdminAnalyticsOut(
        from_date=from_s, to_date=to_s, visits=visits_total, unique_visitors=unique_visitors,
        page_views=views_total, new_visitors=new_visitors, returning_visitors=returning,
        series=series, devices=await breakdown("device"), browsers=await breakdown("browser"),
        top_pages=[{"path": r["_id"], "count": r["count"]} for r in top_pages],
    )


@router.get("/analytics/export")
async def export_csv(a_range: str = "30d", from_date: str | None = None, to_date: str | None = None):
    data = await analytics(a_range, from_date, to_date)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["bucket", "visits", "unique_visitors", "page_views", "active_users"])
    for row in data.series:
        writer.writerow([row["bucket"], row["visits"], row["unique_visitors"],
                         row["views"], row["active_users"]])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="180days-analytics-{data.from_date}-{data.to_date}.csv"'},
    )


@router.get("/users", response_model=AdminUsersOut)
async def admin_users(page: int = 1, limit: int = 20, q: str = ""):
    page = max(1, page)
    limit = min(max(1, limit), 100)
    query: dict = {}
    if q.strip():
        escaped = re.escape(q.strip())
        query = {"$or": [{"name": {"$regex": escaped, "$options": "i"}},
                         {"email": {"$regex": escaped, "$options": "i"}}]}
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}) \
        .sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    user_ids = [u["id"] for u in users]
    journeys = {j["user_id"]: j for j in await db.journeys.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(limit)}
    progress_cursor = await db.task_progress.aggregate(
        [
            {"$match": {"user_id": {"$in": user_ids}}},
            {"$group": {"_id": "$user_id", "done": {"$sum": "$tasks_done"}}},
        ]
    )
    progress_totals = {
        row["_id"]: row["done"] for row in await progress_cursor.to_list(limit)
    }
    now = datetime.now(timezone.utc)
    rows = []
    for u in users:
        j = journeys.get(u["id"])
        current_day = 0
        if j:
            start = datetime.strptime(j["start_date"], "%Y-%m-%d").date()
            delta = (now.date() - start).days + 1
            current_day = max(0, min(180, delta))
        rows.append(AdminUserRow(
            id=u["id"], name=u["name"], email=u["email"], role=u.get("role", "user"),
            email_verified=u.get("email_verified", False), timezone=u.get("timezone", "UTC"),
            created_at=u.get("created_at") or now, last_login_at=u.get("last_login_at"),
            journey_status=j.get("status", "not_started") if j else "not_started",
            current_day=current_day, tasks_done=progress_totals.get(u["id"], 0),
        ))
    return AdminUsersOut(users=rows, total=total, page=page, limit=limit)


@router.get("/overview", response_model=AdminOverviewOut)
async def overview():
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    cutoff_completed = (now - timedelta(days=180)).strftime("%Y-%m-%d")
    total_users = await db.users.count_documents({})
    verified = await db.users.count_documents({"email_verified": True})
    total_journeys = await db.journeys.count_documents({})
    active = await db.journeys.count_documents({"status": "active"})
    completed = await db.journeys.count_documents({"start_date": {"$lte": cutoff_completed}})
    dau_set = await db.analytics_events.distinct(
        "user_id", {"user_id": {"$ne": None}, "ts": {"$gte": now - timedelta(days=1)}})
    mau_set = await db.analytics_events.distinct(
        "user_id", {"user_id": {"$ne": None}, "ts": {"$gte": now - timedelta(days=30)}})
    midnight = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc)
    return AdminOverviewOut(
        total_users=total_users, verified_users=verified,
        total_journeys=total_journeys, active_journeys=active, completed_journeys=completed,
        dau=len(dau_set), mau=len(mau_set),
        new_registrations_today=await db.users.count_documents({"created_at": {"$gte": midnight}}),
        new_registrations_30d=await db.users.count_documents({"created_at": {"$gte": now - timedelta(days=30)}}),
    )


@router.put("/roadmap/day/{day}")
async def admin_edit_day(day: int, body: RoadmapDayUpdateIn, admin: User = Depends(require_admin)):
    if day < 1 or day > 180:
        raise HTTPException(status_code=404, detail="Day out of range")
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    result = await db.roadmap_days.find_one_and_update(
        {"day": day}, {"$set": updates}, return_document=True,
    )
    roadmap_store.invalidate()
    return await day_out(result)


@router.post("/reminders/send", response_model=MessageOut)
async def send_daily_reminders(admin: User = Depends(require_admin)):
    """Dispatch daily study reminders to opted-in users with pending tasks today.

    The same dispatch runs on the Vercel daily schedule.
    """
    sent, skipped = await dispatch_daily_reminders()
    return MessageOut(message=f"Reminders dispatched: {sent} sent, {skipped} skipped.")
