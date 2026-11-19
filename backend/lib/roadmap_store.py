"""In-process, read-mostly cache over the master roadmap collections.

The roadmap is written only by seed.py or an admin route, so every backend instance keeps
one cached copy (no per-request Mongo reads); admin edits bump the version. Progress
routers use it for task-key validation and section totals.
"""

import asyncio

from lib.db import db
from lib.roadmap import build as build_roadmap

_cache: dict | None = None
_lock = asyncio.Lock()


def _fallback() -> dict:
    """Used only if Mongo has not been seeded yet (fresh pod / tests before seeding)."""
    data = build_roadmap()
    return {
        "days": {d["day"]: d for d in data["days"]},
        "interview_days": {d["day"]: d for d in data["interview_days"]},
        "totals": _totals(data["days"]),
        "interview_totals": {
            d["day"]: len(d["tasks"]) for d in data["interview_days"]
        },
        "weekly_items": data["weekly_revision_items"],
        "projects": data["projects"],
        "phases": data["phases"],
    }


def _totals(days: list[dict]) -> dict:
    return {
        d["day"]: {
            "dsa": len(d["dsa"]),
            "mern": len(d["mern"]),
            "revision": len(d["revision"]),
            "all": len(d["dsa"]) + len(d["mern"]) + len(d["revision"]),
        }
        for d in days
    }


async def get() -> dict:
    """Load and cache the master roadmap from Mongo; falls back to the built-in set."""
    global _cache
    if _cache is not None:
        return _cache
    async with _lock:
        if _cache is not None:
            return _cache
        days = await db.roadmap_days.find({}, {"_id": 0}).sort("day", 1).to_list(400)
        if len(days) < 180:
            _cache = _fallback()
            return _cache
        interview = await db.interview_days.find({}, {"_id": 0}).sort("day", 1).to_list(60)
        data = build_roadmap()
        _cache = {
            "days": {d["day"]: d for d in days},
            "interview_days": {d["day"]: d for d in interview} or {d["day"]: d for d in data["interview_days"]},
            "totals": _totals(days),
            "interview_totals": {d["day"]: len(d["tasks"]) for d in interview} or {d["day"]: len(d["tasks"]) for d in data["interview_days"]},
            "weekly_items": data["weekly_revision_items"],
            "projects": data["projects"],
            "phases": data["phases"],
        }
        return _cache


def invalidate() -> None:
    global _cache
    _cache = None


async def get_day(day: int) -> dict | None:
    return (await get())["days"].get(day)


async def valid_keys(day: int) -> list[str]:
    """Task keys allowed for this day (day <= 180 roadmap, day > 180 interview plan)."""
    data = await get()
    if day <= 180:
        d = data["days"].get(day)
        if not d:
            return []
        return [t["key"] for t in d["dsa"] + d["mern"] + d["revision"]]
    iv = data["interview_days"].get(day - 180)
    if not iv:
        return []
    return [t["key"] for t in iv["tasks"]]


async def grand_totals() -> dict:
    """Global curriculum totals: {"dsa": int, "mern": int, "revision": int, "all": int}."""
    totals = (await get())["totals"]
    out = {"dsa": 0, "mern": 0, "revision": 0, "all": 0}
    for v in totals.values():
        out["dsa"] += v["dsa"]
        out["mern"] += v["mern"]
        out["revision"] += v["revision"]
        out["all"] += v["all"]
    return out
