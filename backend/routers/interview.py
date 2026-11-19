"""Four-week (28-day) post-journey mock interview phase: plan + user progress merged."""

from fastapi import APIRouter, Depends

from lib import roadmap_store
from lib.auth import User, get_current_user
from lib.db import db
from models.models import InterviewDayDetail, InterviewPlanOut, SectionStat

router = APIRouter(prefix="/interview", tags=["interview"])


@router.get("/plan", response_model=InterviewPlanOut)
async def interview_plan(user: User = Depends(get_current_user)):
    data = await roadmap_store.get()
    days_master = data["interview_days"]
    weeks: dict = {}
    for d in days_master.values():
        weeks.setdefault(str(d["week"]), {"week": d["week"], "name": d["phase_name"], "days": 0})
        weeks[str(d["week"])]["days"] += 1
    progress = {d["day"]: d for d in
                await db.task_progress.find({"user_id": user.id}, {"_id": 0}).to_list(400)}
    out_days: list[InterviewDayDetail] = []
    done_all = total_all = 0
    for n in sorted(days_master):
        master = days_master[n]
        doc = progress.get(180 + n, {})
        states = doc.get("tasks") or {}
        done = sum(1 for k, v in states.items() if v.get("completed"))
        total = len(master.get("tasks", []))
        done_all += done
        total_all += total
        status = "complete" if total and done >= total else "partial" if done else "none"
        out_days.append(InterviewDayDetail(
            day=master["day"], week=master["week"], title=master["title"],
            phase_name=master.get("phase_name", ""), tasks=master.get("tasks", []),
            tasks_total=total, date="", tasks_total_done=done, day_status=status,  # type: ignore[arg-type]
        ))
    return InterviewPlanOut(
        weeks=weeks, days=out_days,
        overall=SectionStat(done=done_all, total=total_all,
                            pct=round(100 * done_all / total_all) if total_all else 0),
    )
