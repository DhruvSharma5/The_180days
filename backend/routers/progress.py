"""Per-user daily progress: merged day view, autosave upserts, 180-day calendar,
and the dashboard summary (every number computed from real stored data)."""

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from lib import roadmap_store
from lib.auth import User, get_current_user
from lib.db import db
from lib.journey import TOTAL_DAYS, compute, day_date, get_journey, today_in_tz
from models.models import (CalendarOut, DayDetailOut, DayProgressOut, DayStateOut,
                           MockTrendPoint, ProgressUpdateIn, ProjectBrief, RoadmapDayOut,
                           SectionStat, SummaryOut, TaskState, TodayTask, utcnow)
from routers.journey import get_journey_or_none
from routers.roadmap import day_out

router = APIRouter(prefix="/progress", tags=["progress"])


def status_of(done: int, total: int) -> str:
    if total > 0 and done >= total:
        return "complete"
    if done > 0:
        return "partial"
    return "none"


async def load_doc(user_id: str, day: int) -> dict:
    return await db.task_progress.find_one({"user_id": user_id, "day": day}, {"_id": 0}) or {}


async def save_doc(user_id: str, day: int, doc: dict) -> None:
    # Never $set fields owned by $setOnInsert (or immutable ids) — that conflicts on update.
    for immutable in ("created_at", "_id", "id"):
        doc.pop(immutable, None)
    done = sum(1 for t in doc.get("tasks", {}).values() if t.get("completed"))
    dsa = sum(1 for k, t in doc.get("tasks", {}).items() if k.startswith("d") and t.get("completed"))
    mern = sum(1 for k, t in doc.get("tasks", {}).items() if k.startswith("m") and t.get("completed"))
    rev = sum(1 for k, t in doc.get("tasks", {}).items() if k.startswith("r") and t.get("completed"))
    doc.update({
        "user_id": user_id, "day": day, "tasks_done": done,
        "dsa_done": dsa, "mern_done": mern, "rev_done": rev,
        "day_status": status_of(done, doc.get("tasks_total", 0)),
        "updated_at": utcnow(),
    })
    await db.task_progress.update_one(
        {"user_id": user_id, "day": day}, {"$set": doc, "$setOnInsert": {"created_at": utcnow()}},
        upsert=True,
    )


async def progress_out(user_id: str, day: int, tasks_total: int, journey: dict) -> DayProgressOut:
    doc = await load_doc(user_id, day)
    tasks = {k: TaskState(**v) for k, v in (doc.get("tasks") or {}).items()}
    done = sum(1 for t in tasks.values() if t.completed)
    return DayProgressOut(
        day=day, date=day_date(journey, day), tasks=tasks,
        log=doc.get("log") or {}, tasks_done=done, tasks_total=tasks_total,
        day_status=status_of(done, tasks_total),  # type: ignore[arg-type]
        updated_at=doc.get("updated_at"),
    )


@router.get("/day/{day}", response_model=DayDetailOut)
async def get_day(day: int, user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="Start your journey first")
    if day < 1 or day > TOTAL_DAYS:
        raise HTTPException(status_code=404, detail="Day out of range")
    day_doc = await roadmap_store.get_day(day)
    if not day_doc:
        raise HTTPException(status_code=404, detail="Roadmap not seeded")
    tasks_total = len(day_doc.get("dsa", [])) + len(day_doc.get("mern", [])) + len(day_doc.get("revision", []))
    return DayDetailOut(
        roadmap=await day_out(day_doc),
        progress=await progress_out(user.id, day, tasks_total, journey),
    )


@router.put("/day/{day}", response_model=DayProgressOut)
async def update_day(day: int, body: ProgressUpdateIn, user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="Start your journey first")
    view = compute(journey)
    if view.status == "paused":
        raise HTTPException(status_code=409, detail="Your journey is paused — resume to continue")
    # Days 1-180 are the journey (locked until the day arrives); days 181-208 are the
    # four-week interview phase, which is always open.
    if day < 1 or day > TOTAL_DAYS + 28:
        raise HTTPException(status_code=404, detail="Day out of range")
    if 1 <= day <= TOTAL_DAYS and day > view.current_day:
        raise HTTPException(status_code=422, detail=f"Day {day} is not open yet")
    valid = await roadmap_store.valid_keys(day)
    if not valid:
        raise HTTPException(status_code=404, detail="Roadmap not seeded")
    doc = await load_doc(user.id, day)
    doc.setdefault("tasks", {})
    doc.setdefault("log", {})
    for key, patch in (body.tasks or {}).items():
        if key not in valid:
            raise HTTPException(status_code=422, detail=f"Unknown task '{key}' for day {day}")
        state = doc["tasks"].setdefault(key, {"completed": False, "solution_url": "", "notes": "", "revised": False})
        patch_data = patch.model_dump(exclude_none=True)
        if "solution_url" in patch_data:
            patch_data["solution_url"] = patch_data["solution_url"].strip()[:500]
        state.update(patch_data)
    if body.log:
        for field, value in body.log.model_dump(exclude_none=True).items():
            doc["log"][field] = value
    doc["tasks_total"] = len(valid)
    await save_doc(user.id, day, doc)
    return await progress_out(user.id, day, len(valid), journey)


@router.get("/calendar", response_model=CalendarOut)
async def calendar(user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="Start your journey first")
    view = compute(journey)
    docs = {d["day"]: d for d in await db.task_progress.find({"user_id": user.id}, {"_id": 0}).to_list(400)}
    totals = (await roadmap_store.get())["totals"]
    days = []
    for day in range(1, TOTAL_DAYS + 1):
        doc = docs.get(day, {})
        total = doc.get("tasks_total", 0)
        done = doc.get("tasks_done", 0)
        if view.current_day and day <= view.current_day:
            st = status_of(done, total)  # type: ignore[arg-type]
        else:
            st = "upcoming"
        day_totals = totals.get(day, {})
        days.append(DayStateOut(
            day=day, date=day_date(journey, day), status=st,  # type: ignore[arg-type]
            tasks_done=done, tasks_total=total,
            dsa_done=doc.get("dsa_done", 0), dsa_total=day_totals.get("dsa", 0),
            mern_done=doc.get("mern_done", 0), mern_total=day_totals.get("mern", 0),
        ))
    return CalendarOut(start_date=journey["start_date"], current_day=view.current_day,
                       status=view.status, days=days)


def _streaks(done_by_day: dict[int, int], current_day: int) -> tuple[int, int]:
    """Consecutive active days (>=1 task done) ending near today; a not-yet-active
    current day gets grace. Never counts login — only real completed tasks."""
    def active(day: int) -> bool:
        return done_by_day.get(day, 0) > 0

    current = 0
    day = current_day
    if not active(day) and day > 0:
        day -= 1  # today still open — streak not broken yet
    while day >= 1 and active(day):
        current += 1
        day -= 1
    longest = run = 0
    for day in range(1, current_day + 1):
        run = run + 1 if active(day) else 0
        longest = max(longest, run)
    return current, longest


@router.get("/summary", response_model=SummaryOut)
async def summary(user: User = Depends(get_current_user)):
    journey = await get_journey_or_none(user.id)
    if not journey:
        return SummaryOut(
            name=user.name, journey_status="not_started", start_date="", timezone=user.timezone,
            current_day=0, days_remaining=TOTAL_DAYS,
            overall=SectionStat(done=0, total=0, pct=0), dsa=SectionStat(done=0, total=0, pct=0),
            mern=SectionStat(done=0, total=0, pct=0), revision=SectionStat(done=0, total=0, pct=0),
            streak_current=0, streak_longest=0, active_today=False, mocks=[], mock_average=0.0,
            projects=[], today_tasks=[], today_date="", upcoming=[],
        )
    view = compute(journey)
    docs = await db.task_progress.find({"user_id": user.id}, {"_id": 0}).to_list(400)
    done_by_day: dict[int, int] = {}
    dsa_done = mern_done = rev_done = overall_done = 0
    for d in docs:
        done_by_day[d["day"]] = d.get("tasks_done", 0)
        dsa_done += d.get("dsa_done", 0)
        mern_done += d.get("mern_done", 0)
        rev_done += d.get("rev_done", 0)
        overall_done += d.get("tasks_done", 0)
    totals = await roadmap_store.grand_totals()

    def stat(done: int, total: int) -> SectionStat:
        return SectionStat(done=done, total=total, pct=round(100 * done / total) if total else 0)

    current, longest = _streaks(done_by_day, view.current_day)
    active_today = view.current_day > 0 and done_by_day.get(view.current_day, 0) > 0

    mocks_raw = await db.weekly_mocks.find({"user_id": user.id}, {"_id": 0}).sort("week", 1).to_list(60)
    mocks = [MockTrendPoint(week=m["week"], score=m["score"]) for m in mocks_raw]
    mock_avg = round(sum(m["score"] for m in mocks_raw) / len(mocks_raw), 1) if mocks_raw else 0.0

    projects_raw = await db.projects.find({"user_id": user.id}, {"_id": 0}).sort("key", 1).to_list(10)
    projects = []
    for p in projects_raw:
        total_m = max(1, len(p.get("milestones", [])))
        done_m = sum(1 for m in p.get("milestones", []) if m.get("done"))
        projects.append(ProjectBrief(key=p["key"], title=p["title"], status=p.get("status", "not_started"),
                                     pct=round(100 * done_m / total_m)))

    today_tasks: list[TodayTask] = []
    upcoming: list[dict] = []
    today_doc = await roadmap_store.get_day(view.current_day) if view.current_day else None
    if today_doc:
        progress_today = await load_doc(user.id, view.current_day)
        tasks_state = progress_today.get("tasks") or {}
        for section, prefix in (("dsa", "d"), ("mern", "m"), ("revision", "r")):
            for t in today_doc.get(section, []):
                today_tasks.append(TodayTask(
                    key=t["key"], title=t["title"], section=section,  # type: ignore[arg-type]
                    difficulty=t.get("difficulty"), topic=t.get("topic"),
                    completed=bool(tasks_state.get(t["key"], {}).get("completed")),
                ))
        for n in range(view.current_day + 1, min(view.current_day + 4, TOTAL_DAYS + 1)):
            nxt = await roadmap_store.get_day(n)
            if nxt:
                upcoming.append({
                    "day": n, "date": day_date(journey, n), "title": nxt["title"],
                    "tasks_total": len(nxt.get("dsa", [])) + len(nxt.get("mern", [])) + len(nxt.get("revision", [])),
                })

    today_iso = today_in_tz(view.timezone).strftime("%Y-%m-%d")
    return SummaryOut(
        name=user.name, journey_status=view.status,  # type: ignore[arg-type]
        start_date=journey["start_date"], timezone=view.timezone,
        current_day=view.current_day, days_remaining=view.days_remaining,
        overall=stat(overall_done, totals["all"]), dsa=stat(dsa_done, totals["dsa"]),
        mern=stat(mern_done, totals["mern"]), revision=stat(rev_done, totals["revision"]),
        streak_current=current, streak_longest=longest, active_today=active_today,
        mocks=mocks, mock_average=mock_avg, projects=projects,
        today_tasks=today_tasks, today_date=today_iso, upcoming=upcoming,
    )
