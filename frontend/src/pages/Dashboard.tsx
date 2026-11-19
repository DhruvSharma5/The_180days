import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpRight, CalendarClock, CheckCircle2, Circle, Flame, Pause, Play,
  RotateCcw, Sparkles, Target, TrendingUp,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from "@/lib/recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMe } from "@/hooks/useAuth";
import { useJourneyActions, useSaveDay, useSummary } from "@/hooks/useData";
import { DifficultyBadge, ProgressRing, SectionBar, StatusDot, formatDayDate } from "@/components/bits";

const HOUR = new Date().getHours();
const greeting = HOUR < 12 ? "Good morning" : HOUR < 17 ? "Good afternoon" : "Good evening";

export default function Dashboard() {
  const { data: me } = useMe();
  const { data: summary, isLoading } = useSummary();
  const { pause, resume } = useJourneyActions();
  // Hooks run unconditionally — never after the loading return.
  const { mutate: saveDay } = useSaveDay(summary?.current_day ?? 1);

  if (isLoading || !summary) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="dashboard-loading">Loading your journey…</div>;
  }

  const isScheduled = summary.current_day === 0;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8" data-testid="welcome-banner">
        <div aria-hidden className="pointer-events-none absolute inset-0"
             style={{ background: "radial-gradient(ellipse at top right, rgba(20,184,166,0.14) 0%, transparent 60%)" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-muted-foreground" data-testid="welcome-greeting">{greeting},</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl" data-testid="welcome-name">
              {summary.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="journey-meta">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5" aria-hidden />
                Journey started {formatDayDate(summary.start_date)}
              </span>
              <span>·</span>
              <span data-testid="current-day-label">Day {summary.current_day} / 180</span>
              <span>·</span>
              <span data-testid="days-remaining-label">{summary.days_remaining} days remaining</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5" data-testid="today-status">
                <StatusDot status={summary.active_today ? "complete" : "none"} />
                {isScheduled ? "Journey is scheduled" : summary.active_today ? "Today is active" : "Today has no completions yet"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {summary.journey_status === "active" ? (
              <Button variant="outline" size="sm" onClick={() => pause.mutate(undefined, {
                onSuccess: (m) => toast(m.message),
              })} data-testid="pause-journey-button">
                <Pause className="size-4" aria-hidden /> Pause
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => resume.mutate(undefined, {
                onSuccess: (m) => toast(m.message),
              })} data-testid="resume-journey-button">
                <Play className="size-4" aria-hidden /> Resume
              </Button>
            )}
            {summary.journey_status === "paused" ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-500" data-testid="paused-pill">
                Journey paused
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        {/* Today's tasks — the hero widget */}
        <Card className="p-6 md:col-span-8" data-testid="today-tasks-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold">{isScheduled ? "Day 1 preview" : "Today's tasks"}</h2>
              <p className="text-xs text-muted-foreground">
                {isScheduled
                  ? `Day 1 · ${formatDayDate(summary.start_date)}`
                  : `Day ${summary.current_day} · ${summary.today_date ? formatDayDate(summary.today_date) : "—"}`}
              </p>
            </div>
            <Link to={`/daily-tracker?day=${isScheduled ? 1 : summary.current_day}`} className="text-xs font-semibold text-primary hover:underline"
                  data-testid="open-full-day-link">
              {isScheduled ? "Preview Day 1" : "Open full day"} <ArrowUpRight className="inline size-3.5" aria-hidden />
            </Link>
          </div>
          <ul className="mt-4 space-y-2" data-testid="today-tasks-list">
            {summary.today_tasks.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {isScheduled
                  ? "Your journey is scheduled to begin on this date. Tasks unlock when Day 1 starts."
                  : "No roadmap for today — check the calendar."}
              </li>
            ) : summary.today_tasks.map((task) => (
              <li key={task.key}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5"
                  data-testid={`today-task-${task.key}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.completed}
                  aria-label={`Mark "${task.title}" ${task.completed ? "incomplete" : "complete"}`}
                  className="grid size-6 place-items-center rounded-full transition-colors hover:bg-primary/15"
                  onClick={() => {
                    const next = !task.completed;
                    saveDay({ tasks: { [task.key]: { completed: next } } });
                    toast(next ? "Progress saved" : "Marked incomplete", {
                      description: next ? `${task.title}` : task.title,
                    });
                  }}
                  data-testid={`today-task-checkbox-${task.key}`}
                >
                  {task.completed
                    ? <CheckCircle2 className="size-5 text-primary" aria-hidden />
                    : <Circle className="size-5 text-muted-foreground/50" aria-hidden />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${task.completed ? "text-muted-foreground line-through" : "font-medium"}`}>
                    {task.title}
                  </p>
                  {task.topic ? <p className="truncate text-xs text-muted-foreground">{task.topic}</p> : null}
                </div>
                {task.section !== "dsa" ? null : task.difficulty ? <DifficultyBadge difficulty={task.difficulty} /> : null}
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {task.section}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Overall progress + streak */}
        <Card className="flex flex-col items-center justify-center gap-4 p-6 md:col-span-4" data-testid="overall-progress-card">
          <ProgressRing pct={summary.overall.pct} sub="overall" testId="overall-progress-ring" />
          <div className="grid w-full grid-cols-2 gap-3 text-center">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3" data-testid="current-streak-card">
              <p className="flex items-center justify-center gap-1 font-heading text-2xl font-bold text-amber-500">
                <Flame className="size-4" aria-hidden />{summary.streak_current}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">current streak</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3" data-testid="longest-streak-card">
              <p className="font-heading text-2xl font-bold">{summary.streak_longest}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">longest streak</p>
            </div>
          </div>
        </Card>

        {/* Section bars */}
        <Card className="space-y-4 p-6 md:col-span-4" data-testid="roadmap-progress-card">
          <h2 className="font-heading text-lg font-bold">Curriculum progress</h2>
          <SectionBar label="DSA problems" done={summary.dsa.done} total={summary.dsa.total} testId="dsa-progress" />
          <SectionBar label="MERN topics" done={summary.mern.done} total={summary.mern.total} color="var(--chart-2)" testId="mern-progress" />
          <SectionBar label="Revision items" done={summary.revision.done} total={summary.revision.total} color="var(--chart-3)" testId="revision-progress" />
        </Card>

        {/* Mock trend */}
        <Card className="p-6 md:col-span-8" data-testid="mock-trend-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                <Target className="size-4 text-primary" aria-hidden /> Weekly self-mock scores
              </h2>
              <p className="text-xs text-muted-foreground">45-minute mocks, scored 1–5 each week</p>
            </div>
            <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs" data-testid="mock-average">
              avg {summary.mock_average || "–"}
            </span>
          </div>
          <div className="mt-4 h-48" data-testid="mock-trend-chart">
            {summary.mocks.length === 0 ? (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Log your first weekly mock to see the trend.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.mocks} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false}
                         axisLine={{ stroke: "var(--border)" }} />
                  <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                         tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                           labelFormatter={(label: string) => `Week ${label}`} />
                  <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Projects + upcoming */}
        <Card className="space-y-4 p-6 md:col-span-4" data-testid="projects-brief-card">
          <h2 className="font-heading text-lg font-bold">Projects</h2>
          {summary.projects.map((p) => (
            <Link to="/projects" key={p.key} className="block rounded-xl border border-border bg-background/40 p-3 transition-colors hover:border-primary/40"
                  data-testid={`project-brief-${p.key}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <span className="font-mono text-xs text-muted-foreground">{p.pct}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
              </div>
            </Link>
          ))}
        </Card>

        <Card className="p-6 md:col-span-8" data-testid="upcoming-card">
          <h2 className="font-heading text-lg font-bold">Coming up next</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {summary.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {summary.current_day >= 180
                  ? "Journey complete — head to Interview Prep."
                  : "Nothing scheduled ahead."}
              </p>
            ) : summary.upcoming.map((u) => (
              <Link key={u.day} to={`/daily-tracker?day=${u.day}`}
                    className="rounded-xl border border-border bg-background/40 p-4 transition-colors hover:border-primary/40"
                    data-testid={`upcoming-day-${u.day}`}>
                <p className="font-mono text-xs text-muted-foreground">Day {u.day} · {formatDayDate(u.date)}</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium">{u.title}</p>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="size-3" aria-hidden /> {u.tasks_total} tasks
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-primary" aria-hidden />
              Tip: every checkbox autosaves to your account instantly.</span>
            <span className="inline-flex items-center gap-1.5"><RotateCcw className="size-3.5" aria-hidden />
              Revisit any past day from the calendar to backfill notes.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
