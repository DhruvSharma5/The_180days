import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import { apiGet } from "@/lib/api";
import { PageHeader, ProgressRing } from "@/components/bits";
import { useInterviewPlan, useSaveInterviewDay } from "@/hooks/useData";
import type { DayProgressOut } from "@/types";
import { cn } from "@/lib/utils";

export default function InterviewPrep() {
  const { data: plan, isLoading } = useInterviewPlan();
  const [openWeek, setOpenWeek] = useState<number | null>(1);
  const [openDay, setOpenDay] = useState<number | null>(null);

  if (isLoading || !plan) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="interview-prep-loading">Loading interview phase…</div>;
  }

  return (
    <div className="space-y-6" data-testid="interview-prep-page">
      <PageHeader title="Four-Week Interview Sprint" sub="The planner's post-journey phase: DSA mocks, machine coding, system design, behavioural loops" testId="interview-prep-header" />

      <section className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-card p-6" data-testid="interview-overview-card">
        <div>
          <p className="font-heading text-lg font-bold">Sprint progress</p>
          <p className="text-sm text-muted-foreground">{plan.overall.done} of {plan.overall.total} tasks complete across 28 days</p>
        </div>
        <ProgressRing pct={plan.overall.pct} sub="sprint" testId="interview-progress-ring" />
      </section>

      <div className="space-y-4">
        {Object.values(plan.weeks).sort((a, b) => a.week - b.week).map((w) => {
          const days = plan.days.filter((d) => d.week === w.week);
          const isOpen = openWeek === w.week;
          const done = days.reduce((acc, d) => acc + d.tasks_total_done, 0);
          const total = days.reduce((acc, d) => acc + d.tasks_total, 0);
          return (
            <section key={w.week} className="rounded-2xl border border-border bg-card shadow-sm" data-testid={`interview-week-${w.week}`}>
              <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left"
                      onClick={() => setOpenWeek(isOpen ? null : w.week)} aria-expanded={isOpen}
                      data-testid={`interview-week-toggle-${w.week}`}>
                <div>
                  <p className="font-heading font-bold">Week {w.week} · {w.name}</p>
                  <p className="text-xs text-muted-foreground">{done}/{total} tasks</p>
                </div>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen ? (
                <div className="space-y-3 border-t border-border p-5" data-testid={`interview-week-days-${w.week}`}>
                  {days.map((d) => {
                    const dayOpen = openDay === d.day;
                    return (
                      <div key={d.day} className="rounded-xl border border-border bg-background/40" data-testid={`interview-day-${d.day}`}>
                        <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left"
                                onClick={() => setOpenDay(dayOpen ? null : d.day)} aria-expanded={dayOpen}
                                data-testid={`interview-day-toggle-${d.day}`}>
                          <div>
                            <p className="text-sm font-semibold">{d.title}</p>
                            <p className="text-xs text-muted-foreground">{d.tasks_total_done}/{d.tasks_total} done · {d.phase_name}</p>
                          </div>
                          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", dayOpen && "rotate-180")} aria-hidden />
                        </button>
                        {dayOpen ? <InterviewDayTasks day={d.day} /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InterviewDayTasks({ day }: { day: number }) {
  const { data: plan } = useInterviewPlan();
  const { mutate: save } = useSaveInterviewDay(day);
  const detail = plan?.days.find((d) => d.day === day);
  if (!detail) return null;
  return (
    <ul className="space-y-2 border-t border-border p-4" data-testid={`interview-day-tasks-${day}`}>
      {detail.tasks.map((t) => (
        <li key={t.key} className="interview-task" data-interview-day={day} data-task-key={t.key}
            data-testid={`interview-task-${day}-${t.key}`}>
          <InterviewTaskRow day={day} taskKey={t.key} title={t.title} kind={t.kind} onSave={save} />
        </li>
      ))}
    </ul>
  );
}

function InterviewTaskRow({ day, taskKey, title, kind, onSave }: {
  day: number;
  taskKey: string;
  title: string;
  kind: string;
  onSave: (body: { tasks: Record<string, { completed: boolean }> }) => void;
}) {
  const { data: progress } = useQuery({
    queryKey: ["interview-progress", day],
    queryFn: () => apiGet<DayProgressOut>(`/progress/day/${180 + day}`),
    staleTime: 10_000,
  });
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setChecked(progress?.tasks?.[taskKey]?.completed ?? false);
  }, [progress, taskKey]);

  return (
    <div className="flex items-center gap-3">
      <button type="button" role="checkbox" aria-checked={checked}
              onClick={() => {
                const next = !checked;
                setChecked(next);
                onSave({ tasks: { [taskKey]: { completed: next } } });
                toast(next ? "Saved" : "Marked incomplete");
              }}
              className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2 transition-all",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
              aria-label={`Mark "${title}" complete`}
              data-testid={`interview-task-checkbox-${day}-${taskKey}`}>
        {checked ? <Check className="size-3" aria-hidden /> : null}
      </button>
      <p className={cn("flex-1 text-sm", checked && "text-muted-foreground line-through")}>{title}</p>
      <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{kind}</span>
    </div>
  );
}
