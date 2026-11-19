// Shared presentational bits: stat cards, progress ring, badges, section bars.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, sub, icon, className, testId }: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-2 font-heading text-3xl font-bold tracking-tight" data-testid={testId ? `${testId}-value` : undefined}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function ProgressRing({ pct, size = 112, stroke = 10, label, sub, testId }: {
  pct: number;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  testId?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} data-testid={testId}>
      <svg width={size} height={size} className="-rotate-90" role="img"
           aria-label={label ? `${label}: ${clamped}%` : `${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-heading text-2xl font-bold">{clamped}%</p>
        {sub ? <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

const DIFF_STYLES: Record<string, string> = {
  Easy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Hard: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    DIFF_STYLES[difficulty] ?? "border-border bg-muted text-muted-foreground")}
      data-testid={`difficulty-badge-${difficulty.toLowerCase()}`}
    >
      {difficulty}
    </span>
  );
}

export function SectionBar({ label, done, total, color = "var(--primary)", testId }: {
  label: string;
  done: number;
  total: number;
  color?: string;
  testId?: string;
}) {
  const pct = total > 0 ? Math.round((100 * done) / total) : 0;
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground" data-testid={testId ? `${testId}-count` : undefined}>
          {done} / {total} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: "width 600ms cubic-bezier(0.22,1,0.36,1)" }}
          data-testid={testId ? `${testId}-bar` : undefined}
        />
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, action, testId }: {
  title: string;
  sub?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4" data-testid={testId}>
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, sub, action }: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      {icon}
      <p className="font-heading font-semibold">{title}</p>
      {sub ? <p className="max-w-sm text-sm text-muted-foreground">{sub}</p> : null}
      {action}
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  complete: "bg-emerald-500",
  partial: "bg-amber-500",
  none: "bg-rose-500/70",
  upcoming: "bg-slate-500/40",
  not_started: "bg-slate-500/40",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 rounded-full", STATUS_DOT[status] ?? "bg-slate-500/40", className)} />;
}

export function formatDayDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
