import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, CalendarClock, Loader2, MapPin, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe, useUpdateProfile } from "@/hooks/useAuth";
import { useJourney, useStartJourney } from "@/hooks/useData";
import { formatDayDate } from "@/components/bits";
import { TIMEZONES } from "@/types";
import { FullLoader } from "@/components/guards";
import { detailOf } from "@/lib/api";

export default function Onboarding() {
  const { isLoading: meLoading, data: me } = useMe();
  const { isLoading: journeyLoading, data: journeyState } = useJourney();
  const { mutateAsync: start, isPending } = useStartJourney();
  const { mutateAsync: saveProfile } = useUpdateProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [timezone, setTimezone] = useState(me?.timezone ?? "Asia/Kolkata");
  const [startDate, setStartDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [dateEdited, setDateEdited] = useState(false);
  const [notifyDaily, setNotifyDaily] = useState(false);
  const [notifyWeekly, setNotifyWeekly] = useState(false);
  const [notifyMonthly, setNotifyMonthly] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const endDate = startDate ? (() => {
    const date = new Date(`${startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 179);
    return date.toISOString().slice(0, 10);
  })() : "";

  useEffect(() => {
    if (me?.timezone) setTimezone(me.timezone);
  }, [me?.timezone]);

  useEffect(() => {
    if (!dateEdited) setStartDate(today);
  }, [dateEdited, today]);

  useEffect(() => {
    if (journeyState?.journey) {
      navigate("/dashboard", { replace: true });
    }
  }, [journeyState?.journey, navigate]);

  if (meLoading || journeyLoading) return <FullLoader label="Preparing your journey" />;
  if (!me) return <Link to="/login" replace />;

  const onStart = async () => {
    setError("");
    if (!startDate || startDate < today) {
      setError("Choose today or a future date for your journey.");
      return;
    }
    try {
      await saveProfile({ timezone, notify_daily: notifyDaily, notify_weekly: notifyWeekly, notify_monthly: notifyMonthly });
      await start({ timezone, start_date: startDate, confirm: true });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(
        startDate === today
          ? "Your 180-day journey begins today. Day 1 is live!"
          : `Your journey is scheduled for ${formatDayDate(startDate)}. Your dashboard will stay at Day 0 until then.`,
      );
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const detail = detailOf(err);
      setError(detail ?? "Could not start the journey — try again");
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6" data-testid="onboarding-page">
      <div className="w-full max-w-xl">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary" data-testid="onboarding-badge">
            <Rocket className="size-3.5" aria-hidden /> Final step
          </span>
          <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight">Confirm your journey</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Day 1 begins on the date below, in your timezone. All 180 days are calculated
            from it — every user's journey is independent.
          </p>

          <div className="mt-6 space-y-5">
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-background/50 p-4 sm:flex-row sm:items-center" data-testid="onboarding-start-date-card">
              <div className="grid size-11 place-items-center rounded-lg bg-primary/15 text-primary">
                <CalendarClock className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Day 1 starts</p>
                <Label htmlFor="onboarding-start-date">Choose your start date</Label>
                <Input
                  id="onboarding-start-date"
                  type="date"
                  min={today}
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setDateEdited(true);
                  }}
                  required
                  data-testid="onboarding-start-date-input"
                />
                <p className="text-sm font-semibold" data-testid="onboarding-start-date">
                  Day 1: {formatDayDate(startDate)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Day 180 ends {formatDayDate(endDate)}. You can choose today or schedule a future start.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden /> Your timezone</Label>
              <Select value={timezone} onValueChange={(v) => setTimezone(v)}>
                <SelectTrigger data-testid="onboarding-timezone-select">
                  <SelectValue>{timezone}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used to compute your calendar dates and "today" — no more midnight surprises.</p>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium"><BellRing className="size-4 text-primary" aria-hidden /> Reminders (optional)</p>
              {[
                { label: "Daily study reminder", checked: notifyDaily, set: setNotifyDaily, test: "notify-daily" },
                { label: "Weekly revision & mock reminder", checked: notifyWeekly, set: setNotifyWeekly, test: "notify-weekly" },
                { label: "Monthly checkpoint reminder", checked: notifyMonthly, set: setNotifyMonthly, test: "notify-monthly" },
              ].map((n) => (
                <label key={n.test} className="flex items-center gap-2 text-sm" data-testid={`onboarding-${n.test}-row`}>
                  <Checkbox checked={n.checked} onCheckedChange={(v) => n.set(v === true)} data-testid={`onboarding-${n.test}-checkbox`} />
                  {n.label}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">You can change these anytime in Settings. Nothing is sent unless you opt in.</p>
            </div>

            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="onboarding-error">
                {error}
              </p>
            ) : null}

            <Button size="lg" className="w-full" onClick={onStart} disabled={isPending || !startDate} data-testid="start-journey-button">
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
              Start My Journey
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You can pause later — completed progress is always preserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
