"""Personal 180-day journey: one-time start (Day 1 = the date the user clicks start,
in their own timezone), read, pause, resume. Progress is keyed by day number, so a
pause/resume shifts the calendar but never loses a completed task."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import User, get_current_user
from lib.db import db
from lib.journey import (
    TOTAL_DAYS,
    JourneyView,
    compute,
    create_journey,
    day_date,
    parse_date,
    today_in_tz,
    valid_timezone,
)
from models.models import JourneyStartIn, MessageOut, ProjectOut, utcnow
from routers.auth import user_out

router = APIRouter(prefix="/journey", tags=["journey"])


@router.post("/start", status_code=201)
async def start_journey(body: JourneyStartIn, user: User = Depends(get_current_user)):
    if await get_journey_or_none(user.id):
        raise HTTPException(status_code=409, detail="Your journey has already started")
    if not valid_timezone(body.timezone):
        raise HTTPException(status_code=422, detail="Unknown timezone")
    tz = body.timezone
    today = today_in_tz(tz)
    start = today
    if body.start_date:
        parsed = parse_date(body.start_date)
        if not parsed:
            raise HTTPException(status_code=422, detail="start_date must be YYYY-MM-DD")
        if parsed < today:
            raise HTTPException(
                status_code=422, detail="start_date cannot be in the past"
            )
        start = parsed
    journey = await create_journey(user.id, tz, start.strftime("%Y-%m-%d"))
    await init_projects(user.id)
    view = compute(journey)
    return {"journey": view, "day_1_date": day_date(journey, 1)}


async def get_journey_or_none(user_id: str) -> dict | None:
    return await db.journeys.find_one({"user_id": user_id}, {"_id": 0})


@router.get("")
async def get_journey_state(user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        return {"journey": None}
    view = compute(journey)
    return {"journey": view, "day_1_date": day_date(journey, 1)}


@router.post("/pause", response_model=MessageOut)
async def pause_journey(user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="No journey started yet")
    if journey.get("status") == "paused":
        raise HTTPException(status_code=409, detail="Journey is already paused")
    paused_at = datetime.now(ZoneInfo(journey.get("timezone", "UTC")))
    await db.journeys.update_one(
        {"user_id": user.id}, {"$set": {"status": "paused", "paused_at": paused_at}}
    )
    return MessageOut(
        message="Journey paused — your schedule resumes where you left off."
    )


@router.post("/resume", response_model=MessageOut)
async def resume_journey(user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="No journey started yet")
    if journey.get("status") != "paused":
        raise HTTPException(status_code=409, detail="Journey is not paused")
    tz = journey.get("timezone", "UTC")
    paused_at = journey.get("paused_at")
    # Shift start_date forward by the paused time so day dates keep lining up with the plan.
    if paused_at:
        if isinstance(paused_at, dict):
            paused_at = (
                datetime.fromisoformat(paused_at.get("$date", ""))
                if paused_at.get("$date")
                else None
            )
        paused_day = (
            paused_at.date() if isinstance(paused_at, datetime) else today_in_tz(tz)
        )
        shift = (today_in_tz(tz) - paused_day).days
    else:
        shift = 0
    start = parse_date(journey["start_date"]) or today_in_tz(tz)
    new_start = min(start + timedelta(days=shift), today_in_tz(tz))
    await db.journeys.update_one(
        {"user_id": user.id},
        {
            "$set": {
                "status": "active",
                "paused_at": None,
                "start_date": new_start.strftime("%Y-%m-%d"),
            }
        },
    )
    return MessageOut(message="Journey resumed — welcome back, keep the streak going.")


async def init_projects(user_id: str) -> None:
    """Create the user's three project trackers from the master templates."""
    from lib.roadmap_store import get

    templates = (await get())["projects"]
    for tpl in templates:
        exists = await db.projects.find_one(
            {"user_id": user_id, "key": tpl["key"]}, {"_id": 1}
        )
        if exists:
            continue
        await db.projects.insert_one(
            {
                "id": __import__("uuid").uuid4().hex,
                "user_id": user_id,
                "key": tpl["key"],
                "title": tpl["title"],
                "description": tpl["description"],
                "due_day": tpl["due_day"],
                "milestones": [
                    {"id": f"s{i + 1}", "title": m, "done": False}
                    for i, m in enumerate(tpl["milestones"])
                ],
                "github_url": "",
                "live_url": "",
                "status": "not_started",
                "completion_date": "",
                "notes": "",
                "updated_at": None,
            }
        )


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="Start your journey first")
    docs = (
        await db.projects.find({"user_id": user.id}, {"_id": 0})
        .sort("key", 1)
        .to_list(10)
    )
    out = []
    for d in docs:
        done = sum(1 for m in d.get("milestones", []) if m.get("done"))
        total = max(1, len(d.get("milestones", [])))
        out.append(
            ProjectOut(
                key=d["key"],
                title=d["title"],
                description=d["description"],
                due_day=d.get("due_day", 0),
                milestones=d.get("milestones", []),
                github_url=d.get("github_url", ""),
                live_url=d.get("live_url", ""),
                status=d.get("status", "not_started"),
                completion_date=d.get("completion_date", ""),
                notes=d.get("notes", ""),
                pct=round(100 * done / total),
                updated_at=d.get("updated_at"),
            )
        )
    return out
