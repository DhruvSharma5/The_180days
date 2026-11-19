import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import {
  CartesianGrid, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "@/lib/recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/bits";
import { useMocks, useSaveMock } from "@/hooks/useData";
import { cn } from "@/lib/utils";

export default function MockTracker() {
  const { data: mocks, isLoading } = useMocks();
  const { mutate: saveMock, isPending } = useSaveMock();
  const [week, setWeek] = useState(1);
  const [score, setScore] = useState(3);
  const [dsaSolved, setDsaSolved] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");
  const [weakAreas, setWeakAreas] = useState("");
  const [notes, setNotes] = useState("");

  const existing = mocks?.find((m) => m.week === week);
  useEffect(() => {
    if (existing) {
      setScore(existing.score);
      setDsaSolved(existing.dsa_solved?.toString() ?? "");
      setTimeMinutes(existing.time_minutes?.toString() ?? "");
      setWeakAreas(existing.weak_areas);
      setNotes(existing.notes);
    } else {
      setScore(3);
      setDsaSolved("");
      setTimeMinutes("");
      setWeakAreas("");
      setNotes("");
    }
  }, [existing, week]);

  return (
    <div className="space-y-6" data-testid="mock-tracker-page">
      <PageHeader title="Weekly Mock Tracker" sub="One 45-minute self-mock per week — the trend line is your interview readiness" testId="mock-tracker-header" />

      <section className="rounded-2xl border border-border bg-card p-6" data-testid="mock-chart-card">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <Target className="size-4 text-primary" aria-hidden /> Score trend
          </h2>
          <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs">
            {mocks?.length ?? 0} logged
          </span>
        </div>
        <div className="mt-4 h-56">
          {(mocks?.length ?? 0) === 0 ? (
            <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              No mocks yet — pick a week below and log your first score.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mocks} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false}
                       axisLine={{ stroke: "var(--border)" }} />
                <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                       tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                         labelFormatter={(label: string) => `Week ${label}`} />
                <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3.5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="mock-weeks-card">
          <p className="font-heading font-bold">All 25 weekly self-mocks</p>
          <p className="text-xs text-muted-foreground">One per Sunday (Day 7, 14 … 175) — click a week to edit.</p>
          <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-9 lg:grid-cols-13" data-testid="mock-week-grid">
            {Array.from({ length: 25 }, (_, i) => i + 1).map((w) => {
              const m = mocks?.find((x) => x.week === w);
              return (
                <button key={w} type="button" onClick={() => setWeek(w)}
                        className={cn("grid h-14 place-items-center rounded-lg border font-mono text-sm transition-colors",
                          w === week ? "border-primary bg-primary/15" : "border-border bg-background/40 hover:border-primary/40",
                          !m && "text-muted-foreground/50")}
                        data-testid={`mock-week-${w}`}>
                  {m ? `${m.score}` : "·"}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Cell shows the logged score; · means not logged yet.</p>
        </section>

        <section className="h-fit rounded-2xl border border-border bg-card p-5" data-testid="mock-editor-card">
          <p className="font-heading font-bold">Week {week}</p>
          <div className="mt-4 flex gap-2" data-testid="mock-editor-score">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setScore(s)}
                      className={cn("h-11 flex-1 rounded-lg border font-heading text-lg font-bold transition-colors",
                        s === score ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}
                      aria-pressed={s === score} data-testid={`mock-editor-score-${s}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mock-dsa-solved">DSA solved</Label>
              <Input id="mock-dsa-solved" type="number" min={0} max={50} value={dsaSolved}
                     onChange={(e) => setDsaSolved(e.target.value)} data-testid="mock-dsa-solved-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mock-time">Minutes</Label>
              <Input id="mock-time" type="number" min={0} max={600} value={timeMinutes}
                     onChange={(e) => setTimeMinutes(e.target.value)} data-testid="mock-time-input" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="mock-weak">Weak areas</Label>
            <Input id="mock-weak" value={weakAreas} onChange={(e) => setWeakAreas(e.target.value)}
                   placeholder="DP, graphs…" data-testid="mock-weak-input" />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="mock-notes">Notes</Label>
            <Textarea id="mock-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder="What tripped you up? What to redo?" data-testid="mock-notes-input" />
          </div>
          <Button className="mt-4 w-full" disabled={isPending}
                  onClick={() => saveMock({ week, body: {
                    score,
                    dsa_solved: dsaSolved === "" ? null : Number(dsaSolved),
                    time_minutes: timeMinutes === "" ? null : Number(timeMinutes),
                    weak_areas: weakAreas, notes,
                  } })} data-testid="mock-editor-save-button">
            {isPending ? "Saving…" : existing ? "Update week " + week : "Log week " + week}
          </Button>
        </section>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading saved mocks…</p> : null}
    </div>
  );
}
