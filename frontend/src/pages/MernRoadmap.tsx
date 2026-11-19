import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, formatDayDate } from "@/components/bits";
import { useCalendar, useDayDetail, useRoadmapOverview, useSaveDay, useSummary } from "@/hooks/useData";
import { cn } from "@/lib/utils";

export default function MernRoadmap() {
  const { data: overview, isLoading } = useRoadmapOverview();
  const { data: calendar } = useCalendar();
  const { data: summary } = useSummary();
  const [openPhase, setOpenPhase] = useState<number | null>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);

  const { data: detail, isLoading: detailLoading } = useDayDetail(selectedDay);
  const { mutate: saveDay } = useSaveDay(selectedDay);
  const locked = !summary || summary.journey_status === "paused" || selectedDay > summary.current_day;
  const doneMap = new Map((calendar?.days ?? []).map((d) => [d.day, d]));

  if (isLoading || !overview) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="mern-roadmap-loading"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading roadmap…</div>;
  }

  return (
    <div className="space-y-6" data-testid="mern-roadmap-page">
      <PageHeader
        title="MERN Roadmap"
        sub={`155 MERN study days · ${overview.totals.mern} learning objectives, each with its own checkbox`}
        testId="mern-roadmap-header"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {overview.phases.map((phase) => {
            const isOpen = openPhase === phase.phase;
            return (
              <section key={phase.phase} className="rounded-2xl border border-border bg-card shadow-sm" data-testid={`phase-${phase.phase}`}>
                <button type="button" className="flex w-full items-center justify-between gap-3 p-5 text-left"
                        onClick={() => setOpenPhase(isOpen ? null : phase.phase)}
                        aria-expanded={isOpen} data-testid={`mern-phase-toggle-${phase.phase}`}>
                  <div>
                    <p className="font-heading font-bold">Month {phase.phase} · {phase.name}</p>
                    <p className="text-xs text-muted-foreground">Days {phase.start_day}–{phase.end_day} · {phase.mern_total} MERN topics</p>
                  </div>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen ? (
                  <div className="flex flex-wrap gap-2 border-t border-border p-5" data-testid={`mern-phase-days-${phase.phase}`}>
                    {Array.from({ length: phase.end_day - phase.start_day + 1 }, (_, i) => phase.start_day + i)
                      .map((d) => {
                        const cd = doneMap.get(d);
                        const mernDone = cd?.mern_done ?? 0;
                        const mernTotal = cd?.mern_total ?? 0;
                        return (
                          <button key={d} type="button" onClick={() => setSelectedDay(d)}
                                  className={cn("min-w-20 rounded-lg border px-3 py-2 text-left transition-colors",
                                    d === selectedDay ? "border-primary bg-primary/15" : "border-border bg-background/40 hover:border-primary/40")}
                                  data-testid={`mern-day-chip-${d}`}>
                            <span className="block font-mono text-xs font-bold">Day {d}</span>
                            <span className="block text-[10px] text-muted-foreground">{mernDone}/{mernTotal || "–"} MERN</span>
                          </button>
                        );
                      })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24" data-testid="mern-day-panel">
          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading day…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading font-bold">Day {detail.roadmap.day}</p>
                <span className="font-mono text-xs text-muted-foreground">{formatDayDate(detail.progress.date)}</span>
              </div>
              {detail.roadmap.mern[0]?.topic ? (
                <p className="mt-2 font-heading text-sm font-semibold text-primary" data-testid="mern-day-topic">
                  {detail.roadmap.mern[0].topic}
                </p>
              ) : null}
              <ul className="mt-4 space-y-3" data-testid="mern-topic-list">
                {detail.roadmap.mern.map((t) => {
                  const state = detail.progress.tasks[t.key];
                  const completed = state?.completed ?? false;
                  return (
                    <li key={t.key} className="rounded-lg border border-border bg-background/40 p-3" data-testid={`mern-topic-${t.key}`}>
                      <div className="flex items-start gap-2.5">
                        <button type="button" role="checkbox" aria-checked={completed}
                                disabled={locked}
                                onClick={() => {
                                  saveDay({ tasks: { [t.key]: { completed: !completed } } });
                                }}
                                className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-all",
                                  completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                                aria-label={`Mark "${t.title}" complete`}
                                data-testid={`mern-topic-checkbox-${t.key}`}>
                          {completed ? <Check className="size-3" aria-hidden /> : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-medium", completed && "text-muted-foreground line-through")}>{t.title}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {detail.roadmap.mern.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                    Sunday weekly revision — the MERN week recap is in the Revision section of this day.
                  </li>
                ) : null}
              </ul>
              <Button variant="outline" size="sm" className="mt-4 w-full" render={
                <Link to={`/daily-tracker?day=${detail.roadmap.day}`} data-testid="mern-open-full-day" />
              }>
                <Layers className="size-4" aria-hidden /> Open full day tracker
              </Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
