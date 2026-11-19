"""Journey date math — anchored server-side, per-user timezone. Never the client clock."""

import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel

from lib.db import db

TOTAL_DAYS = 180


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JourneyView(BaseModel):
    id: str
    user_id: str
    start_date: str
    timezone: str
    status: str
    started_at: datetime
    current_day: int
    days_remaining: int


def valid_timezone(tz: str) -> bool:
    try:
        ZoneInfo(tz)
        return True
    except (ZoneInfoNotFoundError, KeyError, ValueError):
        return False


def today_in_tz(tz: str) -> date:
    return datetime.now(ZoneInfo(tz)).date()


def parse_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def day_date(journey: dict, day: int) -> str:
    """Calendar date (YYYY-MM-DD in the journey's timezone) of journey day N."""
    start = parse_date(journey["start_date"])
    if not start:
        return ""
    return (start + timedelta(days=day - 1)).strftime("%Y-%m-%d")


def compute(journey: dict) -> JourneyView:
    """Attach current_day / days_remaining to a journey doc."""
    start = parse_date(journey["start_date"]) or today_in_tz(journey.get("timezone", "UTC"))
    today = today_in_tz(journey.get("timezone", "UTC"))
    delta = (today - start).days + 1
    current_day = max(0, min(TOTAL_DAYS, delta))
    return JourneyView(
        id=journey["id"],
        user_id=journey["user_id"],
        start_date=journey["start_date"],
        timezone=journey.get("timezone", "UTC"),
        status=journey.get("status", "active"),
        started_at=journey.get("started_at") or utcnow(),
        current_day=current_day,
        days_remaining=max(0, TOTAL_DAYS - current_day),
    )


async def get_journey(user_id: str) -> dict | None:
    return await db.journeys.find_one({"user_id": user_id}, {"_id": 0})


async def create_journey(user_id: str, timezone_name: str, start_date: str) -> dict:
    journey = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "start_date": start_date,
        "timezone": timezone_name,
        "status": "active",
        "paused_at": None,
        "started_at": utcnow(),
    }
    await db.journeys.insert_one(journey.copy())
    return journey
