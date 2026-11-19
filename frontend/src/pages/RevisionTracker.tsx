import { useEffect, useState } from "react";
import { Check, Loader2, NotebookPen, RotateCcw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/bits";
import { useDayDetail, useMocks, useSaveDay, useSaveMock, useSaveWeeklyRevision, useSummary, useWeeklyRevision } from "@/hooks/useData";
import { cn } from "@/lib/utils";

const WEEKLY_ITEMS = [
  { key: "redo6", title: "Redo the 6 toughest DSA problems of this week (no hints)" },
  { key: "pattern_notes", title: "Re-dry-run every pattern learned this week; update your pattern notes" },
  { key: "unsolved", title: "Re-attempt any problem you could not solve alone (watch the solution only after 30 min)" },
  { key: "rebuild", title: "Rebuild one small thing from this week from scratch (no copy-paste)" },
  { key: "bugs", title: "Fix pending bugs / unfinished tasks and push to GitHub" },
  { key: "five_questions", title: "Write 5 interview questions from this week and answer them aloud" },
  { key: "mock45", title: "45-min timed self-mock (1 DSA + 10 Qs), score 1-5, note 3 weak topics" },
];

export default function RevisionTracker() {
  const { data: summary } = useSummary();
  const { data: mocks } = useMocks();
  const currentDay = summary?.current_day ?? 1;
  const currentWeek = Math.min(25, Math.max(1, Math.ceil(currentDay / 7)));
  const [week, setWeek] = useState(currentWeek);
  const [items, setItems] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [mockScore, setMockScore] = useState(3);
  const [weakAreas, setWeakAreas] = useState("");

  const { data: weekData, isLoading: weekLoading } = useWeeklyRevision(week);
  const { mutate: saveRevision } = useSaveWeeklyRevision(week);
  const { mutate: saveMock } = useSaveMock();

  const { data: dayDetail } = useDayDetail(currentDay);
  const { mutate: saveDay } = useSaveDay(currentDay);

  useEffect(() => {
    if (weekData) {
      setItems(weekData.items ?? {});
      setNotes(weekData.notes ?? "");
    }
  }, [weekData]);

  const existingMock = mocks?.find((m) => m.week === week);
  useEffect(() => {
    if (existingMock) {
      setMockScore(existingMock.score);
      setWeakAreas(existingMock.weak_areas);
    } else {
      setMockScore(3);
      setWeakAreas("");
    }
  }, [existingMock]);

  const toggleItem = (key: string, value: boolean) => {
    const next = { ...items, [key]: value };
    setItems(next);
    saveRevision({ items: next, notes });
  };

  const revisionTasks = dayDetail?.roadmap.revision ?? [];

  return (
    <div className="space-y-6" data-testid="revision-tracker-page">
      <PageHeader title="Revision Tracker" sub="Daily spaced repetition + the planner's weekly revision system" testId="revision-header" />

      <Tabs defaultValue="daily">
        <TabsList data-testid="revision-tabs">
          <TabsTrigger value="daily"><RotateCcw className="mr-1.5 size-4" aria-hidden />Daily revision</TabsTrigger>
          <TabsTrigger value="weekly"><NotebookPen className="mr-1.5 size-4" aria-hidden />Weekly revision</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <section className="rounded-2xl border border-border bg-card p-5" data-testid="daily-revision-card">
            <p className="font-heading font-bold">Day {currentDay} · today's revision</p>
            <p className="text-xs text-muted-foreground">Yesterday's problems, the 7-day refresher and MERN flashcards.</p>
            <ul className="mt-4 space-y-2" data-testid="daily-revision-list">
              {revisionTasks.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Start your journey to see revision tasks.</li>
              ) : revisionTasks.map((t) => {
                const completed = dayDetail?.progress.tasks[t.key]?.completed ?? false;
                return (
                  <li key={t.key} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3" data-testid={`revision-task-${t.key}`}>
                    <button type="button" role="checkbox" aria-checked={completed}
                            onClick={() => saveDay({ tasks: { [t.key]: { completed: !completed } } })}
                            className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all",
                              completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                            aria-label={`Mark "${t.title}" complete`} data-testid={`revision-task-checkbox-${t.key}`}>
                      {completed ? <Check className="size-3.5" aria-hidden /> : null}
                    </button>
                    <p className={cn("flex-1 text-sm", completed && "text-muted-foreground line-through")}>{t.title}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="weekly" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="rounded-2xl border border-border bg-card p-5" data-testid="weekly-revision-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-heading font-bold">Week {week} revision checklist</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setWeek((w) => Math.max(1, w - 1))} disabled={week <= 1} data-testid="prev-week-button">Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setWeek((w) => Math.min(25, w + 1))} disabled={week >= 25} data-testid="next-week-button">Next</Button>
                </div>
              </div>
              {weekLoading ? (
                <p className="mt-4 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading…</p>
              ) : (
                <ul className="mt-4 space-y-2" data-testid="weekly-revision-list">
                  {WEEKLY_ITEMS.map((item) => {
                    const checked = items[item.key] ?? false;
                    return (
                      <li key={item.key} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3" data-testid={`weekly-item-${item.key}`}>
                        <Checkbox checked={checked} onCheckedChange={(v) => toggleItem(item.key, v === true)}
                                  data-testid={`weekly-item-checkbox-${item.key}`} />
                        <p className={cn("flex-1 text-sm", checked && "text-muted-foreground line-through")}>{item.title}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 space-y-2">
                <Label htmlFor="revision-notes">Week notes</Label>
                <Textarea id="revision-notes" rows={3} value={notes} data-testid="weekly-revision-notes"
                          onChange={(e) => setNotes(e.target.value)}
                          onBlur={() => saveRevision({ items, notes })}
                          placeholder="Patterns learned, weak spots, what to double-down on next week…" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Checkboxes save instantly; notes save when you click away.</p>
            </section>

            <section className="h-fit rounded-2xl border border-border bg-card p-5" data-testid="weekly-mock-card">
              <p className="flex items-center gap-2 font-heading font-bold"><Target className="size-4 text-primary" aria-hidden /> Week {week} self-mock</p>
              <p className="mt-1 text-xs text-muted-foreground">Score your 45-minute mock from 1 (rough) to 5 (nailed it).</p>
              <div className="mt-4 flex gap-2" data-testid="mock-score-picker">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => setMockScore(s)}
                          className={cn("h-11 flex-1 rounded-lg border font-heading text-lg font-bold transition-colors",
                            s === mockScore ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}
                          aria-pressed={s === mockScore} data-testid={`mock-score-${s}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="weak-areas">Weak areas this week</Label>
                <Input id="weak-areas" value={weakAreas} onChange={(e) => setWeakAreas(e.target.value)}
                       placeholder="e.g. Graphs, sliding window" data-testid="mock-weak-areas-input" />
              </div>
              <Button className="mt-4 w-full" onClick={() => saveMock({ week, body: { score: mockScore, weak_areas: weakAreas } },
                { onSuccess: () => setWeek(week) })} data-testid="mock-save-button">
                Save week {week} score
              </Button>
              {existingMock ? (
                <p className="mt-2 text-center text-xs text-muted-foreground" data-testid="mock-saved-note">
                  Saved: score {existingMock.score}/5
                </p>
              ) : null}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
