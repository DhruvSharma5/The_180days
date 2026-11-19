import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, ChevronDown, Code2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, DifficultyBadge, formatDayDate } from "@/components/bits";
import { useCalendar, useDayDetail, useRoadmapOverview, useSaveDay, useSummary } from "@/hooks/useData";
import { cn } from "@/lib/utils";

const FILTERS = ["All", "Easy", "Medium", "Hard"] as const;

export default function DsaRoadmap() {
  const { data: overview, isLoading } = useRoadmapOverview();
  const { data: calendar } = useCalendar();
  const { data: summary } = useSummary();
  const [openPhase, setOpenPhase] = useState<number | null>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const { data: detail, isLoading: detailLoading } = useDayDetail(selectedDay);
  const { mutate: saveDay } = useSaveDay(selectedDay);
  const locked = !summary || summary.journey_status === "paused" || selectedDay > summary.current_day;
  const doneMap = new Map((calendar?.days ?? []).map((d) => [d.day, d]));

  if (isLoading || !overview) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="dsa-roadmap-loading"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading roadmap…</div>;
  }

  return (
    <div className="space-y-6" data-testid="dsa-roadmap-page">
      <PageHeader
        title="DSA Roadmap"
        sub={`${overview.totals.dsa} problems from Striver's A2Z sheet, in the planner's exact day-wise order`}
        testId="dsa-roadmap-header"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {overview.phases.map((phase) => {
            const isOpen = openPhase === phase.phase;
            return (
              <section key={phase.phase} className="rounded-2xl border border-border bg-card shadow-sm" data-testid={`phase-${phase.phase}`}>
                <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left"
                        onClick={() => setOpenPhase(isOpen ? null : phase.phase)}
                        aria-expanded={isOpen} data-testid={`phase-toggle-${phase.phase}`}>
                  <div>
                    <p className="font-heading font-bold">Month {phase.phase} · {phase.name}</p>
                    <p className="text-xs text-muted-foreground">Days {phase.start_day}–{phase.end_day} · {phase.dsa_total} DSA · {phase.mern_total} MERN</p>
                  </div>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen ? (
                  <div className="flex flex-wrap gap-2 border-t border-border p-5" data-testid={`phase-days-${phase.phase}`}>
                    {Array.from({ length: phase.end_day - phase.start_day + 1 }, (_, i) => phase.start_day + i).map((d) => {
                      const cd = doneMap.get(d);
                      const dsaDone = cd?.dsa_done ?? 0;
                      const dsaTotal = cd?.dsa_total ?? 0;
                      return (
                        <button key={d} type="button" onClick={() => setSelectedDay(d)}
                                className={cn("min-w-20 rounded-lg border px-3 py-2 text-left transition-colors",
                                  d === selectedDay ? "border-primary bg-primary/15" : "border-border bg-background/40 hover:border-primary/40")}
                                data-testid={`dsa-day-chip-${d}`}>
                          <span className="block font-mono text-xs font-bold">Day {d}</span>
                          <span className="block text-[10px] text-muted-foreground">{dsaDone}/{dsaTotal || "–"} DSA</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        {/* Selected day panel */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24" data-testid="dsa-day-panel">
          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading day…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading font-bold">Day {detail.roadmap.day}</p>
                <span className="font-mono text-xs text-muted-foreground">{formatDayDate(detail.progress.date)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail.roadmap.title}</p>

              <div className="mt-3 flex gap-1.5">
                {FILTERS.map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)}
                          className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            filter === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}
                          data-testid={`dsa-filter-${f.toLowerCase()}`}>
                    {f}
                  </button>
                ))}
              </div>

              <ul className="mt-4 space-y-2" data-testid="dsa-problem-list">
                {detail.roadmap.dsa.filter((t) => filter === "All" || t.difficulty === filter).map((t) => {
                  const state = detail.progress.tasks[t.key];
                  const completed = state?.completed ?? false;
                  return (
                    <li key={t.key} className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 p-3"
                        data-testid={`dsa-problem-${t.key}`}>
                      <button type="button" role="checkbox" aria-checked={completed}
                              disabled={locked}
                              onClick={() => {
                                saveDay({ tasks: { [t.key]: { completed: !completed } } });
                                toast(!completed ? "Problem completed" : "Marked incomplete");
                              }}
                              className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-all",
                                completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                              aria-label={`Mark ${t.title} ${completed ? "incomplete" : "complete"}`}
                              data-testid={`dsa-problem-checkbox-${t.key}`}>
                        {completed ? <Check className="size-3" aria-hidden /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-medium", completed && "text-muted-foreground line-through")}>
                          <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{t.num}</span>{t.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <DifficultyBadge difficulty={t.difficulty} />
                          {state?.solution_url ? (
                            <a href={state.solution_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              solution <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : null}
                          {state?.revised ? <span className="text-xs text-emerald-500">revised</span> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {detail.roadmap.dsa.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Revision / step-review day — no new problems (see this day's Revision section).</li>
                ) : null}
              </ul>

              <Button variant="outline" size="sm" className="mt-4 w-full" render={
                <Link to={`/daily-tracker?day=${detail.roadmap.day}`} data-testid="dsa-open-full-day" />
              }>
                <Code2 className="size-4" aria-hidden /> Open full day tracker
              </Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
