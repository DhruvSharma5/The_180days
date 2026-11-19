"""User profile: read/update own profile, notification preferences, full data export."""

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import User, get_current_user
from lib.db import db
from lib.journey import valid_timezone
from models.models import ProfileUpdateIn, UserOut, utcnow
from routers.auth import user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return user_out(doc)


@router.patch("/me", response_model=UserOut)
async def update_me(body: ProfileUpdateIn, user: User = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "timezone" in updates and not valid_timezone(updates["timezone"]):
        raise HTTPException(status_code=422, detail="Unknown timezone")
    if updates:
        await db.users.update_one({"id": user.id}, {"$set": updates})
    doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    return user_out(doc)


@router.get("/me/export")
async def export_my_data(user: User = Depends(get_current_user)):
    """Complete data portability — everything this account owns, as JSON."""
    journey = await db.journeys.find_one({"user_id": user.id}, {"_id": 0})
    return {
        "user": (await db.users.find_one({"id": user.id}, {"_id": 0,
                "password_hash": 0})),
        "journey": journey,
        "progress": await db.task_progress.find({"user_id": user.id}, {"_id": 0}).to_list(400),
        "mocks": await db.weekly_mocks.find({"user_id": user.id}, {"_id": 0}).to_list(60),
        "weekly_revisions": await db.weekly_revisions.find({"user_id": user.id}, {"_id": 0}).to_list(60),
        "checkpoints": await db.monthly_checkpoints.find({"user_id": user.id}, {"_id": 0}).to_list(12),
        "projects": await db.projects.find({"user_id": user.id}, {"_id": 0}).to_list(10),
    }
