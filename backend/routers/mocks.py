"""Weekly self-mock scores (1-5) with trend data for the charts."""

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import User, get_current_user
from lib.db import db
from models.models import MockIn, MockOut, utcnow

router = APIRouter(prefix="/mocks", tags=["mocks"])
MAX_WEEKS = 26  # 180 days / 7


@router.get("", response_model=list[MockOut])
async def list_mocks(user: User = Depends(get_current_user)):
    docs = await db.weekly_mocks.find({"user_id": user.id}, {"_id": 0}).sort("week", 1).to_list(60)
    return [MockOut(week=d["week"], score=d["score"], dsa_solved=d.get("dsa_solved"),
                    time_minutes=d.get("time_minutes"), weak_areas=d.get("weak_areas", ""),
                    notes=d.get("notes", ""), updated_at=d.get("updated_at")) for d in docs]


@router.put("/week/{week}", response_model=MockOut)
async def upsert_mock(week: int, body: MockIn, user: User = Depends(get_current_user)):
    if week < 1 or week > MAX_WEEKS:
        raise HTTPException(status_code=404, detail="Week out of range")
    payload = {"score": body.score, "dsa_solved": body.dsa_solved, "time_minutes": body.time_minutes,
               "weak_areas": (body.weak_areas or "").strip()[:2000], "notes": (body.notes or "").strip()[:4000],
               "updated_at": utcnow()}
    await db.weekly_mocks.update_one(
        {"user_id": user.id, "week": week},
        {"$set": payload, "$setOnInsert": {"user_id": user.id, "week": week, "created_at": utcnow()}},
        upsert=True,
    )
    return MockOut(week=week, **payload)
