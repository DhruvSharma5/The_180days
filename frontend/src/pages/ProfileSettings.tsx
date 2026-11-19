import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BellRing, Download, KeyRound, Loader2, MapPin, Pause, Play, ShieldCheck, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, formatDayDate } from "@/components/bits";
import { apiGet } from "@/lib/api";
import { useChangePassword, useMe, useUpdateProfile } from "@/hooks/useAuth";
import { useJourneyActions, useSummary } from "@/hooks/useData";
import { endSession } from "@/lib/session";
import { TIMEZONES } from "@/types";

export default function ProfileSettings() {
  const { data: me } = useMe();
  const { data: summary } = useSummary();
  const { mutateAsync: saveProfile, isPending: savingProfile } = useUpdateProfile();
  const { mutateAsync: changePassword, isPending: savingPassword } = useChangePassword();
  const { pause, resume } = useJourneyActions();

  const [name, setName] = useState(me?.name ?? "");
  const [timezone, setTimezone] = useState(me?.timezone ?? "UTC");
  const [notifyDaily, setNotifyDaily] = useState(me?.notify_daily ?? false);
  const [notifyIncomplete, setNotifyIncomplete] = useState(me?.notify_incomplete ?? false);
  const [notifyWeekly, setNotifyWeekly] = useState(me?.notify_weekly ?? false);
  const [notifyMonthly, setNotifyMonthly] = useState(me?.notify_monthly ?? false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  useEffect(() => {
    if (me) {
      setName(me.name);
      setTimezone(me.timezone);
      setNotifyDaily(me.notify_daily);
      setNotifyIncomplete(me.notify_incomplete);
      setNotifyWeekly(me.notify_weekly);
      setNotifyMonthly(me.notify_monthly);
    }
  }, [me]);

  const exportData = async () => {
    const data = await apiGet<Record<string, unknown>>("/users/me/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "180days-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Your data has been exported");
  };

  return (
    <div className="max-w-3xl space-y-6" data-testid="profile-settings-page">
      <PageHeader title="Profile & Settings" sub="Your account, journey control, reminders and data" testId="profile-header" />

      {/* Profile */}
      <section className="rounded-2xl border border-border bg-card p-6" data-testid="profile-card">
        <h2 className="flex items-center gap-2 font-heading font-bold"><UserRound className="size-4 text-primary" aria-hidden /> Profile</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Full name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={me?.email ?? ""} readOnly className="opacity-60" data-testid="profile-email-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5" htmlFor="profile-timezone"><MapPin className="size-3.5" aria-hidden /> Timezone</Label>
            <Select value={timezone} onValueChange={(v) => setTimezone(v)}>
              <SelectTrigger data-testid="profile-timezone-select">
                <SelectValue>{timezone}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button disabled={savingProfile} onClick={async () => {
              await saveProfile({ name, timezone });
              toast.success("Profile saved");
            }} data-testid="profile-save-button">
              {savingProfile ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Save profile
            </Button>
          </div>
        </div>
      </section>

      {/* Journey control */}
      <section className="rounded-2xl border border-border bg-card p-6" data-testid="journey-card">
        <h2 className="font-heading font-bold">Journey</h2>
        {summary && summary.journey_status !== "not_started" ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground" data-testid="journey-info">
              Started {formatDayDate(summary.start_date)} · Day {summary.current_day}/180 · status{" "}
              <span className="font-mono">{summary.journey_status}</span> · timezone <span className="font-mono">{summary.timezone}</span>
            </div>
            {summary.journey_status === "active" ? (
              <Button variant="outline" size="sm" onClick={() => pause.mutate(undefined, { onSuccess: (m) => toast(m.message) })}
                      data-testid="journey-pause-button">
                <Pause className="size-4" aria-hidden /> Pause journey
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => resume.mutate(undefined, { onSuccess: (m) => toast(m.message) })}
                      data-testid="journey-resume-button">
                <Play className="size-4" aria-hidden /> Resume journey
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No journey started yet.</p>
        )}
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border border-border bg-card p-6" data-testid="notifications-card">
        <h2 className="flex items-center gap-2 font-heading font-bold"><BellRing className="size-4 text-primary" aria-hidden /> Reminders</h2>
        <div className="mt-4 space-y-3">
          {[
            { label: "Daily study reminder (email, on days with pending tasks)", checked: notifyDaily, set: setNotifyDaily, test: "daily", key: "notify_daily" },
            { label: "Incomplete task nudge", checked: notifyIncomplete, set: setNotifyIncomplete, test: "incomplete", key: "notify_incomplete" },
            { label: "Weekly revision & mock reminder", checked: notifyWeekly, set: setNotifyWeekly, test: "weekly", key: "notify_weekly" },
            { label: "Monthly checkpoint reminder", checked: notifyMonthly, set: setNotifyMonthly, test: "monthly", key: "notify_monthly" },
          ].map((n) => (
            <label key={n.key} className="flex items-center gap-2 text-sm" data-testid={`notification-${n.test}-row`}>
              <Checkbox checked={n.checked} onCheckedChange={(v) => {
                n.set(v === true);
                void saveProfile({ [n.key]: v === true }).then(() => toast.success("Reminder preferences saved"));
              }} data-testid={`notification-${n.test}-checkbox`} />
              {n.label}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Nothing is ever sent unless you opt in above.</p>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-border bg-card p-6" data-testid="password-card">
        <h2 className="flex items-center gap-2 font-heading font-bold"><KeyRound className="size-4 text-primary" aria-hidden /> Change password</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault();
          if (newPw !== confirmPw) {
            toast.error("New passwords do not match");
            return;
          }
          try {
            const res = await changePassword({ current_password: currentPw, new_password: newPw });
            toast.success(res.message);
            setCurrentPw(""); setNewPw(""); setConfirmPw("");
          } catch {
            toast.error("Could not change password — check your current password");
          }
        }} data-testid="change-password-form">
          <div className="space-y-1.5">
            <Label htmlFor="current-pw">Current</Label>
            <Input id="current-pw" type="password" autoComplete="current-password" value={currentPw}
                   onChange={(e) => setCurrentPw(e.target.value)} data-testid="current-password-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New</Label>
            <Input id="new-pw" type="password" autoComplete="new-password" value={newPw}
                   onChange={(e) => setNewPw(e.target.value)} data-testid="new-password-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm new</Label>
            <Input id="confirm-pw" type="password" autoComplete="new-password" value={confirmPw}
                   onChange={(e) => setConfirmPw(e.target.value)} data-testid="confirm-password-input" />
          </div>
          <Button type="submit" disabled={savingPassword} className="sm:col-span-3" data-testid="change-password-button">
            {savingPassword ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Update password
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Changing your password signs out all other sessions.</p>
      </section>

      {/* Data & account */}
      <section className="rounded-2xl border border-border bg-card p-6" data-testid="account-card">
        <h2 className="flex items-center gap-2 font-heading font-bold"><ShieldCheck className="size-4 text-primary" aria-hidden /> Data & account</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void exportData()} data-testid="export-data-button">
            <Download className="size-4" aria-hidden /> Export my data (JSON)
          </Button>
          <Button variant="destructive" onClick={() => void endSession("/login")} data-testid="sign-out-button-settings">
            Sign out
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The export contains every record tied to your account: profile, journey, daily progress,
          mocks, checkpoints and projects.
        </p>
      </section>
    </div>
  );
}
