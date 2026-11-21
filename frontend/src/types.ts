// Hand-written mirrors of the backend Pydantic models (backend/models/models.py).
// Nothing infers across the Python boundary — keep these in sync in the same edit.

export interface UserOut {
  id: string;
  name: string;
  email: string;
  role: string;
  email_verified: boolean;
  timezone: string;
  notify_daily: boolean;
  notify_incomplete: boolean;
  notify_weekly: boolean;
  notify_monthly: boolean;
  created_at: string;
}

export interface AuthOut {
  user: UserOut;
  verification_email_sent?: boolean | null;
}

export interface LoginChallengeOut {
  message: string;
  email: string;
}

export interface MessageOut {
  message: string;
}

export interface JourneyView {
  id: string;
  user_id: string;
  start_date: string;
  timezone: string;
  status: "active" | "paused";
  started_at: string;
  current_day: number;
  days_remaining: number;
}

export interface JourneyState {
  journey: JourneyView | null;
  day_1_date?: string;
}

export interface DsaTask {
  key: string;
  num: number;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
}

export interface MernTask {
  key: string;
  title: string;
  detail: string;
  kind: "learn" | "practice" | "project";
  topic: string;
}

export interface RevisionTask {
  key: string;
  title: string;
}

export interface RoadmapDayOut {
  day: number;
  title: string;
  phase: number;
  phase_name: string;
  dsa: DsaTask[];
  mern: MernTask[];
  revision: RevisionTask[];
  tasks_total: number;
}

export interface TaskState {
  completed: boolean;
  solution_url: string;
  notes: string;
  revised: boolean;
}

export interface LogState {
  wake_time: string;
  study_minutes: number | null;
  learning: string;
  notes: string;
}

export interface DayProgressOut {
  day: number;
  date: string;
  tasks: Record<string, TaskState>;
  log: LogState;
  tasks_done: number;
  tasks_total: number;
  day_status: "complete" | "partial" | "none";
  updated_at: string | null;
}

export interface DayDetailOut {
  roadmap: RoadmapDayOut;
  progress: DayProgressOut;
}

export interface DayStateOut {
  day: number;
  date: string;
  status: "complete" | "partial" | "none" | "upcoming";
  tasks_done: number;
  tasks_total: number;
  dsa_done: number;
  dsa_total: number;
  mern_done: number;
  mern_total: number;
}

export interface CalendarOut {
  start_date: string;
  current_day: number;
  status: string;
  days: DayStateOut[];
}

export interface SectionStat {
  done: number;
  total: number;
  pct: number;
}

export interface MockTrendPoint {
  week: number;
  score: number;
}

export interface ProjectBrief {
  key: string;
  title: string;
  status: string;
  pct: number;
}

export interface TodayTask {
  key: string;
  title: string;
  section: "dsa" | "mern" | "revision";
  difficulty: string | null;
  topic: string | null;
  completed: boolean;
}

export interface SummaryOut {
  name: string;
  journey_status: "not_started" | "active" | "paused";
  start_date: string;
  timezone: string;
  current_day: number;
  days_remaining: number;
  overall: SectionStat;
  dsa: SectionStat;
  mern: SectionStat;
  revision: SectionStat;
  streak_current: number;
  streak_longest: number;
  active_today: boolean;
  mocks: MockTrendPoint[];
  mock_average: number;
  projects: ProjectBrief[];
  today_tasks: TodayTask[];
  today_date: string;
  upcoming: { day: number; date: string; title: string; tasks_total: number }[];
}

export interface MockOut {
  week: number;
  score: number;
  dsa_solved: number | null;
  time_minutes: number | null;
  weak_areas: string;
  notes: string;
  updated_at: string | null;
}

export interface WeeklyRevisionOut {
  week: number;
  items: Record<string, boolean>;
  notes: string;
  updated_at: string | null;
}

export interface CheckpointOut {
  month: number;
  start_day: number;
  end_day: number;
  dsa_done: number;
  mern_done: number;
  tasks_done: number;
  active_days: number;
  mock_scores: number[];
  mock_average: number;
  weak_areas: string;
  worked_well: string;
  needs_improvement: string;
  goals: string;
  reflections: string;
  updated_at: string | null;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

export interface ProjectOut {
  key: string;
  title: string;
  description: string;
  due_day: number;
  milestones: Milestone[];
  github_url: string;
  live_url: string;
  status: string;
  completion_date: string;
  notes: string;
  pct: number;
  updated_at: string | null;
}

export interface InterviewTask {
  key: string;
  title: string;
  kind: "learn" | "practice";
}

export interface InterviewDayDetail {
  day: number;
  week: number;
  title: string;
  phase_name: string;
  tasks: InterviewTask[];
  tasks_total: number;
  date: string;
  tasks_total_done: number;
  day_status: "complete" | "partial" | "none";
}

export interface InterviewPlanOut {
  weeks: Record<string, { week: number; name: string; days: number }>;
  days: InterviewDayDetail[];
  overall: SectionStat;
}

export interface OverviewOut {
  total_days: number;
  totals: { dsa: number; mern: number; revision: number; all: number };
  phases: {
    phase: number;
    name: string;
    start_day: number;
    end_day: number;
    dsa_total: number;
    mern_total: number;
  }[];
}

export interface AdminAnalyticsOut {
  from_date: string;
  to_date: string;
  visits: number;
  unique_visitors: number;
  page_views: number;
  new_visitors: number;
  returning_visitors: number;
  series: { bucket: string; visits: number; views: number; unique_visitors: number; active_users: number }[];
  devices: { name: string; count: number }[];
  browsers: { name: string; count: number }[];
  top_pages: { path: string; count: number }[];
}

export interface AdminOverviewOut {
  total_users: number;
  verified_users: number;
  total_journeys: number;
  active_journeys: number;
  completed_journeys: number;
  dau: number;
  mau: number;
  new_registrations_today: number;
  new_registrations_30d: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  email_verified: boolean;
  timezone: string;
  created_at: string;
  last_login_at: string | null;
  journey_status: string;
  current_day: number;
  tasks_done: number;
}

export interface AdminUsersOut {
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
}

// ---- request bodies ----

export interface SignupBody {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface LoginBody {
  email: string;
  password: string;
  remember: boolean;
}

export interface LoginVerifyBody {
  email: string;
  code: string;
  remember: boolean;
}

export interface ResetBody {
  token: string;
  password: string;
}

export interface ChangePasswordBody {
  current_password: string;
  new_password: string;
}

export interface ProfileUpdateBody {
  name?: string;
  timezone?: string;
  notify_daily?: boolean;
  notify_incomplete?: boolean;
  notify_weekly?: boolean;
  notify_monthly?: boolean;
}

export interface JourneyStartBody {
  timezone: string;
  start_date?: string;
  confirm: boolean;
}

export interface TaskPatch {
  completed?: boolean;
  solution_url?: string;
  notes?: string;
  revised?: boolean;
}

export interface ProgressUpdateBody {
  tasks?: Record<string, TaskPatch>;
  log?: {
    wake_time?: string;
    study_minutes?: number | null;
    learning?: string;
    notes?: string;
  };
}

export interface MockBody {
  score: number;
  dsa_solved?: number | null;
  time_minutes?: number | null;
  weak_areas?: string;
  notes?: string;
}

export interface WeeklyRevisionBody {
  items: Record<string, boolean>;
  notes?: string;
}

export interface CheckpointBody {
  weak_areas?: string;
  worked_well?: string;
  needs_improvement?: string;
  goals?: string;
  reflections?: string;
}

export interface ProjectUpdateBody {
  github_url?: string;
  live_url?: string;
  status?: "not_started" | "in_progress" | "completed";
  completion_date?: string;
  notes?: string;
  milestones?: Milestone[];
}

export const TIMEZONES = [
  "Asia/Kolkata", "Asia/Karachi", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Jakarta", "Asia/Seoul", "Asia/Riyadh",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Amsterdam",
  "Europe/Madrid", "Europe/Istanbul", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "Africa/Lagos",
  "Africa/Nairobi", "Africa/Johannesburg", "UTC",
] as const;
