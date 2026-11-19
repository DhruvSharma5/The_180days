"""Project tracker updates — the three project records are created at journey start
(from master templates); users update their own copies only."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import User, get_current_user
from lib.db import db
from models.models import ProjectOut, ProjectUpdateIn, utcnow

router = APIRouter(prefix="/projects", tags=["projects"])
VALID_KEYS = {"p1", "p2", "p3"}


@router.put("/{key}", response_model=ProjectOut)
async def update_project(key: str, body: ProjectUpdateIn, user: User = Depends(get_current_user)):
    if key not in VALID_KEYS:
        raise HTTPException(status_code=404, detail="Unknown project")
    doc = await db.projects.find_one({"user_id": user.id, "key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Start your journey first — projects are created with it")
    updates: dict = {}
    for field in ("github_url", "live_url", "status", "completion_date", "notes"):
        value = getattr(body, field)
        if value is not None:
            updates[field] = value.strip()[:8000] if field == "notes" else value.strip()[:300]
    if body.milestones is not None:
        updates["milestones"] = [m.model_dump() for m in body.milestones]
    if body.status == "completed" and not (updates.get("completion_date") or doc.get("completion_date")):
        updates["completion_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if updates:
        updates["updated_at"] = utcnow()
        await db.projects.update_one({"user_id": user.id, "key": key}, {"$set": updates})
    doc = await db.projects.find_one({"user_id": user.id, "key": key}, {"_id": 0})
    done = sum(1 for m in doc.get("milestones", []) if m.get("done"))
    total = max(1, len(doc.get("milestones", [])))
    return ProjectOut(
        key=doc["key"], title=doc["title"], description=doc["description"], due_day=doc.get("due_day", 0),
        milestones=doc.get("milestones", []), github_url=doc.get("github_url", ""),
        live_url=doc.get("live_url", ""), status=doc.get("status", "not_started"),
        completion_date=doc.get("completion_date", ""), notes=doc.get("notes", ""),
        pct=round(100 * done / total), updated_at=doc.get("updated_at"),
    )
