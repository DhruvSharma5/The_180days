import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Dumbbell, ListChecks,
  Loader2, NotebookPen, PauseCircle, RotateCcw, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useDayDetail, useSaveDay, useSummary } from "@/hooks/useData";
import { DifficultyBadge, ProgressRing, formatDayDate } from "@/components/bits";
import type { LogState, TaskState } from "@/types";
import { cn } from "@/lib/utils";

export default function DailyTracker() {
  const [params, setParams] = useSearchParams();
  const { data: summary } = useSummary();
  const currentDay = summary?.current_day ?? 1;
  const rawDay = Number(params.get("day") ?? "") || currentDay;
  const day = Math.min(180, Math.max(1, rawDay));

  const { data, isLoading } = useDayDetail(day);
  const saveDay = useSaveDay(day);

  const [tasks, setTasks] = useState<Record<string, TaskState>>({});
  const [log, setLog] = useState<LogState>({ wake_time: "", study_minutes: null, learning: "", notes: "" });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data) {
      setTasks(data.progress.tasks);
      setLog(data.progress.log);
      dirty.current = false;
    }
  }, [data]);

  const persist = useCallback((nextTasks: Record<string, TaskState>, nextLog: LogState) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveDay.mutate({
        tasks: Object.fromEntries(Object.entries(nextTasks).map(([k, v]) => [k, {
          completed: v.completed, solution_url: v.solution_url, notes: v.notes, revised: v.revised,
        }])),
        log: nextLog,
      });
    }, 700);
  }, [saveDay]);

  const updateTask = (key: string, patch: Partial<TaskState>) => {
    setTasks((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] ?? { completed: false, solution_url: "", notes: "", revised: false }), ...prev[key], ...patch } };
      dirty.current = true;
      persist(next, log);
      if (patch.completed !== undefined) {
        toast(patch.completed ? "Completed — saved" : "Marked incomplete", { description: next[key].notes ? undefined : undefined });
      }
      return next;
    });
  };

  const updateLog = (patch: Partial<LogState>) => {
    setLog((prev) => {
      const next = { ...prev, ...patch };
      dirty.current = true;
      persist(tasks, next);
      return next;
    });
  };

  const isFuture = summary ? day > summary.current_day : false;
  const isPast = summary ? day < summary.current_day : false;
  const doneCount = useMemo(() => Object.values(tasks).filter((t) => t.completed).length, [tasks]);
  const total = data?.roadmap.tasks_total ?? 0;

  if (isLoading) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="daily-tracker-loading"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading day…</div>;
  }
  if (!data) {
    return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="daily-tracker-missing">Start your journey to see daily tasks.</div>;
  }

  const roadmap = data.roadmap;
  const sections: { id: string; title: string; icon: typeof ListChecks; keys: string[]; hint: string }[] = [
    { id: "dsa", title: "DSA problems", icon: Dumbbell, keys: roadmap.dsa.map((t) => t.key), hint: `${roadmap.dsa.length} problems` },
    { id: "mern", title: "MERN track", icon: NotebookPen, keys: roadmap.mern.map((t) => t.key), hint: `${roadmap.mern.length} objectives` },
    { id: "revision", title: "Revision & evening", icon: RotateCcw, keys: roadmap.revision.map((t) => t.key), hint: `${roadmap.revision.length} items` },
  ];

  return (
    <div className="space-y-6" data-testid="daily-tracker-page">
      {/* Header + day nav */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setParams({ day: String(day - 1) })}
                  disabled={day <= 1} aria-label="Previous day" data-testid="prev-day-button">
            <ChevronLeft className="size-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight" data-testid="day-title">
              Day {day} {day === currentDay ? <span className="text-primary">· today</span> : isPast ? "· past" : null}
            </h1>
            <p className="text-xs text-muted-foreground">{formatDayDate(data.progress.date)} · {roadmap.title}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setParams({ day: String(day + 1) })}
                  disabled={day >= 180} aria-label="Next day" data-testid="next-day-button">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono text-sm font-semibold" data-testid="day-done-count">{doneCount} / {total}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">tasks done</p>
          </div>
          <ProgressRing pct={total ? Math.round((100 * doneCount) / total) : 0} size={72} stroke={8} testId="day-progress-ring" />
        </div>
      </div>

      {/* Quick day strip */}
      <div className="thin-scroll flex items-center gap-2 overflow-x-auto pb-1" data-testid="day-strip">
        {Array.from({ length: 11 }, (_, i) => day - 5 + i)
          .filter((d) => d >= 1 && d <= 180)
          .map((d) => (
            <button key={d} type="button"
                    onClick={() => setParams({ day: String(d) })}
                    className={cn("min-w-14 rounded-lg border px-3 py-2 font-mono text-xs transition-colors",
                      d === day ? "border-primary bg-primary/15 font-bold text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40")}
                    data-testid={`day-strip-${d}`}>
              {d}
            </button>
          ))}
      </div>

      {isFuture ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400" data-testid="future-day-notice">
          Day {day} opens on {formatDayDate(data.progress.date)}. You can preview the plan — checkboxes unlock that day.
        </div>
      ) : null}
      {summary?.journey_status === "paused" && !isFuture ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400" data-testid="paused-notice">
          <PauseCircle className="size-4 shrink-0" aria-hidden />
          Your journey is paused — resume from the dashboard to keep tracking.
        </div>
      ) : null}

      {/* Sections */}
      {sections.map((section) => {
        const isCollapsed = collapsed[section.id] ?? false;
        return (
          <section key={section.id} className="rounded-2xl border border-border bg-card shadow-sm" data-testid={`section-${section.id}`}>
            <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left"
                    onClick={() => setCollapsed((p) => ({ ...p, [section.id]: !isCollapsed }))}
                    aria-expanded={!isCollapsed}
                    data-testid={`section-toggle-${section.id}`}>
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
                  <section.icon className="size-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block font-heading font-bold">{section.title}</span>
                  <span className="text-xs text-muted-foreground">{section.hint}</span>
                </span>
              </span>
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !isCollapsed && "rotate-180")} aria-hidden />
            </button>

            {!isCollapsed ? (
              <div className="space-y-3 border-t border-border p-5">
                {section.id === "dsa" ? roadmap.dsa.map((t) => {
                  const state = tasks[t.key] ?? { completed: false, solution_url: "", notes: "", revised: false };
                  return (
                    <div key={t.key} className="rounded-xl border border-border bg-background/40" data-testid={`task-${t.key}`}>
                      <div className="flex items-start gap-3 p-4">
                        <button type="button" role="checkbox" aria-checked={state.completed}
                                disabled={isFuture}
                                onClick={() => updateTask(t.key, { completed: !state.completed })}
                                className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all",
                                  state.completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                                aria-label={`Mark problem ${t.num}: ${t.title} ${state.completed ? "incomplete" : "complete"}`}
                                data-testid={`task-checkbox-${t.key}`}>
                          {state.completed ? <Check className="size-3.5" aria-hidden /> : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn("flex flex-wrap items-center gap-2 text-sm font-medium", state.completed && "text-muted-foreground line-through")}>
                            <span className="font-mono text-xs text-muted-foreground">#{t.num}</span>
                            {t.title}
                            <DifficultyBadge difficulty={t.difficulty} />
                          </p>
                          <p className="text-xs text-muted-foreground">{t.topic}</p>
                        </div>
                        <button type="button" className="text-xs font-semibold text-primary hover:underline"
                                onClick={() => setExpanded((p) => ({ ...p, [t.key]: !p[t.key] }))}
                                data-testid={`task-details-toggle-${t.key}`}>
                          {expanded[t.key] ? "Hide" : "Notes & link"}
                        </button>
                      </div>
                      {expanded[t.key] ? (
                        <div className="space-y-3 border-t border-border/60 p-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground" htmlFor={`${t.key}-url`}>Solution URL</label>
                              <Input id={`${t.key}-url`} value={state.solution_url} disabled={isFuture}
                                     onChange={(e) => updateTask(t.key, { solution_url: e.target.value })}
                                     placeholder="https://leetcode.com/problems/…" data-testid={`task-url-${t.key}`} />
                            </div>
                            <label className="flex items-center gap-2 pt-5 text-sm" data-testid={`task-revised-${t.key}`}>
                              <Checkbox checked={state.revised} disabled={isFuture}
                                        onCheckedChange={(v) => updateTask(t.key, { revised: v === true })} />
                              Mark as revised
                            </label>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${t.key}-notes`}>Notes</label>
                            <Textarea id={`${t.key}-notes`} value={state.notes} disabled={isFuture}
                                      onChange={(e) => updateTask(t.key, { notes: e.target.value })}
                                      placeholder="Approach, edge cases, time complexity…" rows={2} data-testid={`task-notes-${t.key}`} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                }) : null}

                {section.id === "mern" && roadmap.mern[0]?.topic ? (
                  <p className="font-heading text-sm font-semibold text-primary" data-testid="mern-topic-heading">
                    {roadmap.mern[0].topic}
                  </p>
                ) : null}
                {section.id === "mern" ? roadmap.mern.map((t) => {
                  const state = tasks[t.key] ?? { completed: false, solution_url: "", notes: "", revised: false };
                  return (
                    <div key={t.key} className="rounded-xl border border-border bg-background/40" data-testid={`task-${t.key}`}>
                      <div className="flex items-start gap-3 p-4">
                        <button type="button" role="checkbox" aria-checked={state.completed} disabled={isFuture}
                                onClick={() => updateTask(t.key, { completed: !state.completed })}
                                className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all",
                                  state.completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                                aria-label={`Mark "${t.title}" complete`}
                                data-testid={`task-checkbox-${t.key}`}>
                          {state.completed ? <Check className="size-3.5" aria-hidden /> : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-medium", state.completed && "text-muted-foreground line-through")}>{t.title}</p>
                        </div>
                        <button type="button" className="text-xs font-semibold text-primary hover:underline"
                                onClick={() => setExpanded((p) => ({ ...p, [t.key]: !p[t.key] }))}
                                data-testid={`task-details-toggle-${t.key}`}>
                          {expanded[t.key] || state.notes ? "Notes" : "Add note"}
                        </button>
                      </div>
                      {expanded[t.key] || state.notes ? (
                      <div className="border-t border-border/60 p-4">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${t.key}-notes`}>Personal notes</label>
                        <Textarea id={`${t.key}-notes`} value={state.notes} disabled={isFuture}
                                  onChange={(e) => updateTask(t.key, { notes: e.target.value })}
                                  placeholder="What clicked? What to revisit?" rows={2} data-testid={`task-notes-${t.key}`} />
                      </div>
                      ) : null}
                    </div>
                  );
                }) : null}

                {section.id === "revision" ? roadmap.revision.map((t) => {
                  const state = tasks[t.key] ?? { completed: false, solution_url: "", notes: "", revised: false };
                  return (
                    <div key={t.key} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3" data-testid={`task-${t.key}`}>
                      <button type="button" role="checkbox" aria-checked={state.completed} disabled={isFuture}
                              onClick={() => updateTask(t.key, { completed: !state.completed })}
                              className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all",
                                state.completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                              aria-label={`Mark "${t.title}" complete`}
                              data-testid={`task-checkbox-${t.key}`}>
                        {state.completed ? <Check className="size-3.5" aria-hidden /> : null}
                      </button>
                      <p className={cn("flex-1 text-sm", state.completed && "text-muted-foreground line-through")}>{t.title}</p>
                    </div>
                  );
                }) : null}
              </div>
            ) : null}
          </section>
        );
      })}

      {/* Daily log */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="daily-log-section">
        <h2 className="flex items-center gap-2 font-heading font-bold">
          <NotebookPen className="size-4 text-primary" aria-hidden /> Daily log
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="wake-time">Wake-up time</label>
            <Input id="wake-time" type="time" value={log.wake_time} disabled={isFuture}
                   onChange={(e) => updateLog({ wake_time: e.target.value })} data-testid="wake-time-input" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="study-minutes">Study duration (minutes)</label>
            <Input id="study-minutes" type="number" min={0} max={1440} value={log.study_minutes ?? ""} disabled={isFuture}
                   onChange={(e) => updateLog({ study_minutes: e.target.value === "" ? null : Number(e.target.value) })}
                   placeholder="e.g. 240" data-testid="study-minutes-input" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="today-learning">Today's learning</label>
            <Textarea id="today-learning" value={log.learning} disabled={isFuture}
                      onChange={(e) => updateLog({ learning: e.target.value })}
                      placeholder="The most important thing you learned today…" rows={2} data-testid="today-learning-input" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="day-notes">Notes</label>
            <Textarea id="day-notes" value={log.notes} disabled={isFuture}
                      onChange={(e) => updateLog({ notes: e.target.value })}
                      placeholder="Anything else worth remembering" rows={2} data-testid="day-notes-input" />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="autosave-hint">
          {saveDay.isPending ? <><Loader2 className="size-3 animate-spin" aria-hidden /> Saving…</> : <><Save className="size-3" aria-hidden /> Everything autosaves as you type</>}
        </p>
      </section>
    </div>
  );
}
