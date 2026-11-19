import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, formatDayDate } from "@/components/bits";
import { useCheckpoints, useSaveCheckpoint, useSummary } from "@/hooks/useData";

const FIELDS = [
  { key: "weak_areas", label: "Weak areas", placeholder: "Topics that need another pass…" },
  { key: "worked_well", label: "What worked well", placeholder: "Habits and techniques that paid off…" },
  { key: "needs_improvement", label: "What needs improvement", placeholder: "Be honest — where did the plan slip?" },
  { key: "goals", label: "Next month's goals", placeholder: "Specific, measurable targets…" },
  { key: "reflections", label: "Monthly reflections", placeholder: "The story of this month in your own words…" },
] as const;

export default function Checkpoints() {
  const { data: checkpoints, isLoading } = useCheckpoints();
  const { data: summary } = useSummary();
  const { mutate: save } = useSaveCheckpoint();
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (checkpoints) {
      setDrafts(Object.fromEntries(checkpoints.map((c) => [c.month, {
        weak_areas: c.weak_areas, worked_well: c.worked_well, needs_improvement: c.needs_improvement,
        goals: c.goals, reflections: c.reflections,
      }])));
    }
  }, [checkpoints]);

  if (isLoading || !checkpoints) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="checkpoints-loading"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading checkpoints…</div>;
  }

  const currentMonth = summary ? Math.min(6, Math.max(1, Math.ceil(summary.current_day / 30))) : 1;

  return (
    <div className="space-y-6" data-testid="checkpoints-page">
      <PageHeader title="Monthly Checkpoints" sub="Every 30 days: hard numbers from your data, plus your written review" testId="checkpoints-header" />

      <div className="grid gap-6 lg:grid-cols-2">
        {checkpoints.map((c) => {
          const draft = drafts[c.month] ?? {};
          const isCurrent = c.month === currentMonth;
          return (
            <section key={c.month}
                     className={`rounded-2xl border bg-card p-6 ${isCurrent ? "border-primary/50 shadow-[0_0_20px_rgba(20,184,166,0.08)]" : "border-border"}`}
                     data-testid={`checkpoint-${c.month}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-heading text-lg font-bold">
                  <ClipboardList className="size-4 text-primary" aria-hidden />
                  Month {c.month}
                  {isCurrent ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">current</span> : null}
                </p>
                <p className="font-mono text-xs text-muted-foreground">Days {c.start_day}–{c.end_day}</p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5" data-testid={`checkpoint-stats-${c.month}`}>
                {[
                  { label: "DSA", value: c.dsa_done },
                  { label: "MERN", value: c.mern_done },
                  { label: "tasks", value: c.tasks_done },
                  { label: "active", value: `${c.active_days}/30` },
                  { label: "mock avg", value: c.mock_average || "–" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border bg-background/40 p-2 text-center">
                    <p className="font-heading text-lg font-bold">{s.value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              {c.mock_scores.length > 0 ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground" data-testid={`checkpoint-mocks-${c.month}`}>
                  weekly mocks: {c.mock_scores.join(" · ")}
                </p>
              ) : null}

              <div className="mt-4 space-y-3" data-testid={`checkpoint-form-${c.month}`}>
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`cp-${c.month}-${f.key}`}>{f.label}</label>
                    <Textarea id={`cp-${c.month}-${f.key}`} rows={2}
                              value={draft[f.key] ?? ""}
                              onChange={(e) => setDrafts((p) => ({ ...p, [c.month]: { ...p[c.month], [f.key]: e.target.value } }))}
                              placeholder={f.placeholder}
                              data-testid={`checkpoint-${c.month}-${f.key.replace(/_/g, "-")}-input`} />
                  </div>
                ))}
                <Button size="sm" variant="outline" data-testid={`checkpoint-${c.month}-save-button`}
                        onClick={() => save({ month: c.month, body: draft })}>
                  <PencilLine className="size-3.5" aria-hidden /> Save month {c.month} review
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      <p className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground" data-testid="checkpoints-note">
        <CheckCircle2 className="size-4 text-primary shrink-0" aria-hidden />
        Numbers (DSA, MERN, tasks, active days, mock averages) are computed live from your progress — only the written
        review is yours to fill. Window: {formatDayDate(new Date().toISOString().slice(0, 10))}
      </p>
    </div>
  );
}
