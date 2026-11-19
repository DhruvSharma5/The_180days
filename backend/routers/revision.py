"""Weekly revision tracker — the planner's seven weekly activities per week."""

from fastapi import APIRouter, Depends, HTTPException

from lib import roadmap_store
from lib.auth import User, get_current_user
from lib.db import db
from models.models import WeeklyRevisionIn, WeeklyRevisionOut, utcnow

router = APIRouter(prefix="/revision", tags=["revision"])
MAX_WEEKS = 26


def _valid_keys(weekly_items: list[dict]) -> set[str]:
    return {i["key"] for i in weekly_items}


@router.get("/week/{week}", response_model=WeeklyRevisionOut)
async def get_week(week: int, user: User = Depends(get_current_user)):
    if week < 1 or week > MAX_WEEKS:
        raise HTTPException(status_code=404, detail="Week out of range")
    doc = await db.weekly_revisions.find_one({"user_id": user.id, "week": week}, {"_id": 0}) or {}
    items = doc.get("items") or {}
    return WeeklyRevisionOut(week=week, items=items, notes=doc.get("notes", ""),
                             updated_at=doc.get("updated_at"))


@router.put("/week/{week}", response_model=WeeklyRevisionOut)
async def upsert_week(week: int, body: WeeklyRevisionIn, user: User = Depends(get_current_user)):
    if week < 1 or week > MAX_WEEKS:
        raise HTTPException(status_code=404, detail="Week out of range")
    valid = _valid_keys((await roadmap_store.get())["weekly_items"])
    clean = {k: bool(v) for k, v in body.items.items() if k in valid}
    payload = {"items": clean, "notes": (body.notes or "").strip()[:4000], "updated_at": utcnow()}
    await db.weekly_revisions.update_one(
        {"user_id": user.id, "week": week},
        {"$set": payload, "$setOnInsert": {"user_id": user.id, "week": week, "created_at": utcnow()}},
        upsert=True,
    )
    return WeeklyRevisionOut(week=week, **payload)
