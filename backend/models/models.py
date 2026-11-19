"""Every Pydantic model in the app, in one module. Frontend mirrors live in src/types.ts."""

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- Auth ----------


class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember: bool = True


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=16, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class TokenIn(BaseModel):
    token: str = Field(min_length=16, max_length=128)


class VerificationCodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str = "user"
    email_verified: bool = False
    timezone: str = "UTC"
    notify_daily: bool = False
    notify_incomplete: bool = False
    notify_weekly: bool = False
    notify_monthly: bool = False
    created_at: datetime


class AuthOut(BaseModel):
    user: UserOut
    verification_email_sent: bool | None = None


class MessageOut(BaseModel):
    message: str


# ---------- Profile ----------


class ProfileUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    timezone: str | None = Field(default=None, max_length=64)
    notify_daily: bool | None = None
    notify_incomplete: bool | None = None
    notify_weekly: bool | None = None
    notify_monthly: bool | None = None


# ---------- Journey ----------


class JourneyStartIn(BaseModel):
    timezone: str = Field(default="Asia/Kolkata", max_length=64)
    start_date: str | None = Field(
        default=None,
        description="YYYY-MM-DD; defaults to today in the user's timezone and may be in the future",
    )
    confirm: bool = False


class JourneyOut(BaseModel):
    id: str
    user_id: str
    start_date: str
    timezone: str
    status: Literal["active", "paused"]
    started_at: datetime
    current_day: int = 0
    days_remaining: int = 180


# ---------- Roadmap ----------


class DsaTask(BaseModel):
    key: str
    num: int
    title: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    topic: str


class MernTask(BaseModel):
    key: str
    title: str
    detail: str
    kind: Literal["learn", "practice", "project"]
    topic: str = ""


class RevisionTask(BaseModel):
    key: str
    title: str


class RoadmapDayOut(BaseModel):
    day: int
    title: str
    phase: int
    phase_name: str
    dsa: list[DsaTask]
    mern: list[MernTask]
    revision: list[RevisionTask]
    tasks_total: int


class PhaseOut(BaseModel):
    phase: int
    name: str
    start_day: int
    end_day: int
    dsa_total: int
    mern_total: int


class OverviewOut(BaseModel):
    total_days: int = 180
    totals: dict
    phases: list[PhaseOut]


# ---------- Progress ----------


class TaskStateIn(BaseModel):
    completed: bool | None = None
    solution_url: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)
    revised: bool | None = None


class LogStateIn(BaseModel):
    wake_time: str | None = Field(default=None, max_length=10)
    study_minutes: int | None = Field(default=None, ge=0, le=1440)
    learning: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=4000)


class ProgressUpdateIn(BaseModel):
    tasks: dict[str, TaskStateIn] | None = None
    log: LogStateIn | None = None


class TaskState(BaseModel):
    completed: bool = False
    solution_url: str = ""
    notes: str = ""
    revised: bool = False


class LogState(BaseModel):
    wake_time: str = ""
    study_minutes: int | None = None
    learning: str = ""
    notes: str = ""


class DayProgressOut(BaseModel):
    day: int
    date: str
    tasks: dict[str, TaskState]
    log: LogState
    tasks_done: int = 0
    tasks_total: int = 0
    day_status: Literal["complete", "partial", "none"] = "none"
    updated_at: datetime | None = None


class DayDetailOut(BaseModel):
    roadmap: RoadmapDayOut
    progress: DayProgressOut


class DayStateOut(BaseModel):
    day: int
    date: str
    status: Literal["complete", "partial", "none", "upcoming"]
    tasks_done: int
    tasks_total: int
    dsa_done: int = 0
    dsa_total: int = 0
    mern_done: int = 0
    mern_total: int = 0


class CalendarOut(BaseModel):
    start_date: str
    current_day: int
    status: str
    days: list[DayStateOut]


class SectionStat(BaseModel):
    done: int
    total: int
    pct: int


class MockTrendPoint(BaseModel):
    week: int
    score: int


class ProjectBrief(BaseModel):
    key: str
    title: str
    status: str
    pct: int


class TodayTask(BaseModel):
    key: str
    title: str
    section: Literal["dsa", "mern", "revision"]
    difficulty: str | None = None
    topic: str | None = None
    completed: bool = False


class SummaryOut(BaseModel):
    name: str
    journey_status: Literal["not_started", "active", "paused"]
    start_date: str
    timezone: str
    current_day: int
    days_remaining: int
    overall: SectionStat
    dsa: SectionStat
    mern: SectionStat
    revision: SectionStat
    streak_current: int
    streak_longest: int
    active_today: bool
    mocks: list[MockTrendPoint]
    mock_average: float
    projects: list[ProjectBrief]
    today_tasks: list[TodayTask]
    today_date: str
    upcoming: list[dict]


# ---------- Weekly mocks ----------


class MockIn(BaseModel):
    score: int = Field(ge=1, le=5)
    dsa_solved: int | None = Field(default=None, ge=0, le=50)
    time_minutes: int | None = Field(default=None, ge=0, le=600)
    weak_areas: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=4000)


class MockOut(BaseModel):
    week: int
    score: int
    dsa_solved: int | None = None
    time_minutes: int | None = None
    weak_areas: str = ""
    notes: str = ""
    updated_at: datetime | None = None


# ---------- Weekly revision ----------


class WeeklyRevisionIn(BaseModel):
    items: dict[str, bool]
    notes: str | None = Field(default=None, max_length=4000)


class WeeklyRevisionOut(BaseModel):
    week: int
    items: dict[str, bool]
    notes: str = ""
    updated_at: datetime | None = None


# ---------- Monthly checkpoints ----------


class CheckpointIn(BaseModel):
    weak_areas: str | None = Field(default=None, max_length=4000)
    worked_well: str | None = Field(default=None, max_length=4000)
    needs_improvement: str | None = Field(default=None, max_length=4000)
    goals: str | None = Field(default=None, max_length=4000)
    reflections: str | None = Field(default=None, max_length=8000)


class CheckpointOut(BaseModel):
    month: int
    start_day: int
    end_day: int
    dsa_done: int
    mern_done: int
    tasks_done: int
    active_days: int
    mock_scores: list[int]
    mock_average: float
    weak_areas: str = ""
    worked_well: str = ""
    needs_improvement: str = ""
    goals: str = ""
    reflections: str = ""
    updated_at: datetime | None = None


# ---------- Projects ----------


class MilestoneIn(BaseModel):
    id: str
    title: str = Field(max_length=200)
    done: bool = False


class ProjectUpdateIn(BaseModel):
    github_url: str | None = Field(default=None, max_length=300)
    live_url: str | None = Field(default=None, max_length=300)
    status: Literal["not_started", "in_progress", "completed"] | None = None
    completion_date: str | None = Field(default=None, max_length=10)
    notes: str | None = Field(default=None, max_length=8000)
    milestones: list[MilestoneIn] | None = None


class ProjectOut(BaseModel):
    key: str
    title: str
    description: str
    due_day: int
    milestones: list[MilestoneIn]
    github_url: str = ""
    live_url: str = ""
    status: str = "not_started"
    completion_date: str = ""
    notes: str = ""
    pct: int = 0
    updated_at: datetime | None = None


# ---------- Interview phase ----------


class InterviewTask(BaseModel):
    key: str
    title: str
    kind: Literal["learn", "practice"]


class InterviewDayOut(BaseModel):
    day: int
    week: int
    title: str
    phase_name: str
    tasks: list[InterviewTask]
    tasks_total: int


class InterviewDayDetail(InterviewDayOut):
    date: str
    tasks_total_done: int
    day_status: Literal["complete", "partial", "none"]


class InterviewPlanOut(BaseModel):
    weeks: dict
    days: list[InterviewDayDetail]
    overall: SectionStat


# ---------- Analytics ----------


class AnalyticsEventIn(BaseModel):
    type: Literal["visit", "page_view"]
    session_id: str = Field(min_length=8, max_length=64)
    path: str | None = Field(default=None, max_length=300)
    referrer: str | None = Field(default=None, max_length=300)
    screen_w: int | None = Field(default=None, ge=0, le=20000)
    screen_h: int | None = Field(default=None, ge=0, le=20000)


# ---------- Admin ----------


class AdminRangeIn(BaseModel):
    range: Literal["24h", "7d", "30d", "90d", "custom"] = "7d"
    from_date: str | None = None
    to_date: None | str = None


class AdminAnalyticsOut(BaseModel):
    from_date: str
    to_date: str
    visits: int
    unique_visitors: int
    page_views: int
    new_visitors: int
    returning_visitors: int
    series: list[dict]
    devices: list[dict]
    browsers: list[dict]
    top_pages: list[dict]


class AdminUserRow(BaseModel):
    id: str
    name: str
    email: str
    role: str
    email_verified: bool
    timezone: str
    created_at: datetime
    last_login_at: datetime | None = None
    journey_status: str = "not_started"
    current_day: int = 0
    tasks_done: int = 0


class AdminUsersOut(BaseModel):
    users: list[AdminUserRow]
    total: int
    page: int
    limit: int


class AdminOverviewOut(BaseModel):
    total_users: int
    verified_users: int
    total_journeys: int
    active_journeys: int
    completed_journeys: int
    dau: int
    mau: int
    new_registrations_today: int
    new_registrations_30d: int


class RoadmapDayUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    dsa: list[DsaTask] | None = None
    mern: list[MernTask] | None = None
    revision: list[RevisionTask] | None = None
