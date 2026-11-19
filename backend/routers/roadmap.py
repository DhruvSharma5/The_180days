"""Master roadmap reads (cached in-process) + phase overview. Edits go through /admin."""

import fastapi
from fastapi import Depends

from lib import roadmap_store
from lib.auth import User, get_current_user
from models.models import OverviewOut, PhaseOut, RoadmapDayOut

router = fastapi.APIRouter(prefix="/roadmap", tags=["roadmap"])


async def day_out(day_doc: dict) -> RoadmapDayOut:
    return RoadmapDayOut(
        day=day_doc["day"], title=day_doc["title"], phase=day_doc["phase"],
        phase_name=day_doc.get("phase_name", ""), dsa=day_doc.get("dsa", []),
        mern=day_doc.get("mern", []), revision=day_doc.get("revision", []),
        tasks_total=len(day_doc.get("dsa", [])) + len(day_doc.get("mern", [])) + len(day_doc.get("revision", [])),
    )


@router.get("/day/{day}", response_model=RoadmapDayOut)
async def get_roadmap_day(day: int, user: User = Depends(get_current_user)):
    if day < 1 or day > 180:
        raise fastapi.HTTPException(status_code=404, detail="Day out of range")
    doc = await roadmap_store.get_day(day)
    if not doc:
        raise fastapi.HTTPException(status_code=404, detail="Roadmap not seeded")
    return await day_out(doc)


@router.get("/overview", response_model=OverviewOut)
async def roadmap_overview():
    data = await roadmap_store.get()
    phases = []
    for phase, name in data["phases"].items():
        p = int(phase)
        start_day = (p - 1) * 30 + 1  # the planner's six 30-day months
        end_day = p * 30
        dsa_total = sum(t["dsa"] for d, t in data["totals"].items() if start_day <= d <= end_day)
        mern_total = sum(t["mern"] for d, t in data["totals"].items() if start_day <= d <= end_day)
        phases.append(PhaseOut(phase=p, name=name, start_day=start_day, end_day=end_day,
                               dsa_total=dsa_total, mern_total=mern_total))
    return OverviewOut(phases=phases, totals=await roadmap_store.grand_totals())
