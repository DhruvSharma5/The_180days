"""Monthly checkpoints (months 1-6): auto-computed stats + the user's written review."""

import math

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import User, get_current_user
from lib.db import db
from lib.journey import get_journey
from models.models import CheckpointIn, CheckpointOut, utcnow

router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])
MONTHS = 6
DAYS_PER_MONTH = 30


def _week_window(month: int) -> tuple[int, int]:
    start_day = (month - 1) * DAYS_PER_MONTH + 1
    end_day = month * DAYS_PER_MONTH
    return math.ceil(start_day / 7), math.floor(end_day / 7)


@router.get("", response_model=list[CheckpointOut])
async def list_checkpoints(user: User = Depends(get_current_user)):
    journey = await get_journey(user.id)
    if not journey:
        raise HTTPException(status_code=404, detail="Start your journey first")
    docs = {d["month"]: d for d in
            await db.monthly_checkpoints.find({"user_id": user.id}, {"_id": 0}).to_list(12)}
    progress = await db.task_progress.find({"user_id": user.id}, {"_id": 0}).to_list(400)
    mocks = {m["week"]: m["score"] for m in
             await db.weekly_mocks.find({"user_id": user.id}, {"_id": 0}).to_list(60)}
    out = []
    for month in range(1, MONTHS + 1):
        start_day = (month - 1) * DAYS_PER_MONTH + 1
        end_day = month * DAYS_PER_MONTH
        window = [d for d in progress if start_day <= d["day"] <= end_day]
        tasks_done = sum(d.get("tasks_done", 0) for d in window)
        dsa_done = sum(d.get("dsa_done", 0) for d in window)
        mern_done = sum(d.get("mern_done", 0) for d in window)
        active_days = sum(1 for d in window if d.get("tasks_done", 0) > 0)
        w1, w2 = _week_window(month)
        scores = [mocks[w] for w in range(w1, w2 + 1) if w in mocks]
        doc = docs.get(month, {})
        out.append(CheckpointOut(
            month=month, start_day=start_day, end_day=end_day,
            dsa_done=dsa_done, mern_done=mern_done, tasks_done=tasks_done,
            active_days=active_days, mock_scores=scores,
            mock_average=round(sum(scores) / len(scores), 1) if scores else 0.0,
            weak_areas=doc.get("weak_areas", ""), worked_well=doc.get("worked_well", ""),
            needs_improvement=doc.get("needs_improvement", ""), goals=doc.get("goals", ""),
            reflections=doc.get("reflections", ""), updated_at=doc.get("updated_at"),
        ))
    return out


@router.put("/month/{month}", response_model=CheckpointOut)
async def upsert_checkpoint(month: int, body: CheckpointIn, user: User = Depends(get_current_user)):
    if month < 1 or month > MONTHS:
        raise HTTPException(status_code=404, detail="Month out of range")
    payload = {k: (v or "").strip() for k, v in body.model_dump().items()}
    payload["updated_at"] = utcnow()
    await db.monthly_checkpoints.update_one(
        {"user_id": user.id, "month": month},
        {"$set": payload, "$setOnInsert": {"user_id": user.id, "month": month, "created_at": utcnow()}},
        upsert=True,
    )
    all_rows = await list_checkpoints(user)
    return next(r for r in all_rows if r.month == month)
