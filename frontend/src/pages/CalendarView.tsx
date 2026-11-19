import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCalendar } from "@/hooks/useData";
import { PageHeader } from "@/components/bits";
import { cn } from "@/lib/utils";

const CELL_STYLES: Record<string, string> = {
  complete: "bg-emerald-500/80 text-white border-emerald-400",
  partial: "bg-amber-500/80 text-white border-amber-400",
  none: "bg-rose-500/25 text-rose-300 border-rose-500/40 dark:text-rose-300",
  upcoming: "bg-muted text-muted-foreground/50 border-border",
};

export default function CalendarView() {
  const { data, isLoading } = useCalendar();
  const navigate = useNavigate();

  if (isLoading || !data) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="calendar-loading"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading calendar…</div>;
  }

  const months: { label: string; days: typeof data.days }[] = [];
  for (let m = 0; m < 6; m++) {
    const slice = data.days.slice(m * 30, (m + 1) * 30);
    if (slice.length === 0) continue;
    const first = new Date(`${slice[0].date}T00:00:00`);
    months.push({
      label: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      days: slice,
    });
  }

  return (
    <div className="space-y-6" data-testid="calendar-view-page">
      <PageHeader
        title="180-Day Calendar"
        sub={`Started ${data.start_date} · today is Day ${data.current_day || "—"} · click any day to open its tracker`}
        testId="calendar-header"
      />

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" data-testid="calendar-legend">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-emerald-500/80" /> Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-amber-500/80" /> Partial</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-rose-500/25" /> Missed</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm border-2 border-primary" /> Current</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-muted" /> Upcoming</span>
      </div>

      <div className="grid gap-6 md:grid-cols-2" data-testid="calendar-months">
        {months.map((month) => (
          <div key={month.label} className="rounded-2xl border border-border bg-card p-5" data-testid="calendar-month">
            <p className="font-heading font-bold">{month.label}</p>
            <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
              {month.days.map((d) => {
                const isCurrent = d.day === data.current_day && data.status === "active";
                return (
                  <button
                    key={d.day}
                    type="button"
                    title={`Day ${d.day} · ${d.status}${d.tasks_total ? ` — ${d.tasks_done}/${d.tasks_total} tasks` : ""}`}
                    onClick={() => navigate(`/daily-tracker?day=${d.day}`)}
                    className={cn(
                      "relative grid aspect-square place-items-center rounded-md border font-mono text-[10px] transition-all hover:scale-110",
                      CELL_STYLES[d.status],
                      isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                    aria-label={`Day ${d.day}, ${d.status}${d.tasks_done ? `, ${d.tasks_done} of ${d.tasks_total} tasks done` : ""}`}
                    data-testid={`calendar-day-${d.day}`}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" data-testid="calendar-note">
        A day is <strong>completed</strong> when all its tasks are done, <strong>partial</strong> when at
        least one is, and <strong>missed</strong> only if the day has passed untouched — logging in never
        marks a day complete.
      </p>
      <Link to="/daily-tracker" className="text-sm font-semibold text-primary hover:underline" data-testid="calendar-to-today">
        Jump to today's tracker →
      </Link>
    </div>
  );
}
