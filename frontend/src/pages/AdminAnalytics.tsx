import { useState } from "react";
import { toast } from "sonner";
import {
  Activity, Download, FileJson, Loader2, Search, Send, ShieldCheck, Users2,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "@/lib/recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatCard, StatusDot, formatDayDate } from "@/components/bits";
import { AdminOnly } from "@/components/guards";
import { apiGet, apiPut } from "@/lib/api";
import {
  useAdminAnalytics, useAdminOverview, useAdminUsers, useRoadmapDay, useSendReminders,
} from "@/hooks/useData";
import type { RoadmapDayOut } from "@/types";

const RANGES = ["24h", "7d", "30d", "90d", "custom"] as const;

export default function AdminAnalytics() {
  return (
    <AdminOnly>
      <div className="space-y-6" data-testid="admin-analytics-page">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight md:text-3xl">
            <ShieldCheck className="size-6 text-primary" aria-hidden /> Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Traffic, users, roadmap management and reminders — owner only.</p>
        </div>

        <Tabs defaultValue="analytics">
          <TabsList data-testid="admin-tabs">
            <TabsTrigger value="analytics"><Activity className="mr-1.5 size-4" aria-hidden />Analytics</TabsTrigger>
            <TabsTrigger value="users"><Users2 className="mr-1.5 size-4" aria-hidden />Users</TabsTrigger>
            <TabsTrigger value="roadmap"><FileJson className="mr-1.5 size-4" aria-hidden />Roadmap</TabsTrigger>
            <TabsTrigger value="reminders"><Send className="mr-1.5 size-4" aria-hidden />Reminders</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4"><AnalyticsTab /></TabsContent>
          <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
          <TabsContent value="roadmap" className="mt-4"><RoadmapTab /></TabsContent>
          <TabsContent value="reminders" className="mt-4"><RemindersTab /></TabsContent>
        </Tabs>
      </div>
    </AdminOnly>
  );
}

function AnalyticsTab() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const effective = { range, from_date: range === "custom" ? from : undefined, to_date: range === "custom" ? to : undefined };
  const { data, isLoading } = useAdminAnalytics(effective);
  const { data: overview } = useAdminOverview();

  const exportCsv = () => {
    const params = new URLSearchParams({ range });
    if (range === "custom" && from) { params.set("from_date", from); params.set("to_date", to); }
    window.location.assign(`/api/admin/analytics/export?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" data-testid="analytics-filters">
        <div className="space-y-1.5">
          <Label>Date range</Label>
          <Select value={range} onValueChange={(v) => setRange(v as (typeof RANGES)[number])}>
            <SelectTrigger className="w-40" data-testid="analytics-range-select">
              <SelectValue>{range === "24h" ? "Last 24 hours" : range === "custom" ? "Custom" : `Last ${range}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {range === "custom" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="analytics-from">From</Label>
              <Input id="analytics-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="analytics-from-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analytics-to">To</Label>
              <Input id="analytics-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="analytics-to-input" />
            </div>
          </>
        ) : null}
        <Button variant="outline" onClick={exportCsv} data-testid="analytics-export-button">
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Visits" value={data?.visits ?? "…"} testId="stat-visits" />
        <StatCard label="Unique visitors" value={data?.unique_visitors ?? "…"} testId="stat-unique-visitors" />
        <StatCard label="Page views" value={data?.page_views ?? "…"} testId="stat-page-views" />
        <StatCard label="New visitors" value={data?.new_visitors ?? "…"} testId="stat-new-visitors" />
        <StatCard label="Returning" value={data?.returning_visitors ?? "…"} testId="stat-returning-visitors" />
        <StatCard label="Registered users" value={overview?.total_users ?? "…"} testId="stat-total-users" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Verified" value={overview?.verified_users ?? "…"} testId="stat-verified-users" />
        <StatCard label="Journeys" value={overview?.total_journeys ?? "…"} testId="stat-total-journeys" />
        <StatCard label="Active journeys" value={overview?.active_journeys ?? "…"} testId="stat-active-journeys" />
        <StatCard label="DAU" value={overview?.dau ?? "…"} testId="stat-dau" />
        <StatCard label="MAU" value={overview?.mau ?? "…"} testId="stat-mau" />
        <StatCard label="New (30d)" value={overview?.new_registrations_30d ?? "…"} testId="stat-new-registrations" />
      </div>

      {/* Traffic trend */}
      <section className="rounded-2xl border border-border bg-card p-6" data-testid="traffic-trend-card">
        <h2 className="font-heading font-bold">Traffic trend</h2>
        <div className="mt-4 h-64">
          {isLoading || !data ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading…</div>
          ) : data.series.length === 0 ? (
            <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              No traffic recorded in this window yet — events stream in as people browse.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false}
                       axisLine={{ stroke: "var(--border)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="visits" stroke="var(--chart-1)" fill="url(#visitsFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="views" stroke="var(--chart-2)" fill="url(#viewsFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="device-breakdown">
          <h2 className="font-heading font-bold">Devices</h2>
          <BreakdownBars rows={data?.devices ?? []} testId="device-bars" />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="browser-breakdown">
          <h2 className="font-heading font-bold">Browsers</h2>
          <BreakdownBars rows={data?.browsers ?? []} testId="browser-bars" />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="top-pages">
          <h2 className="font-heading font-bold">Most visited pages</h2>
          <ul className="mt-3 space-y-2">
            {(data?.top_pages ?? []).length === 0 ? (
              <li className="text-sm text-muted-foreground">No page views yet.</li>
            ) : data?.top_pages.map((p) => (
              <li key={p.path} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                <span className="truncate font-mono text-xs">{p.path}</span>
                <span className="font-mono text-xs text-muted-foreground">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="privacy-note">
        Privacy: events carry no IP addresses and no PII — an anonymous session id, page path,
        coarse device/browser class and timestamp. Individual users' notes and progress never
        appear in analytics. Window: {data ? `${formatDayDate(data.from_date)} → ${formatDayDate(data.to_date)}` : "…"}
      </p>
    </div>
  );
}

function BreakdownBars({ rows, testId }: { rows: { name: string; count: number }[]; testId: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="mt-3 space-y-2" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs capitalize">{r.name}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(100 * r.count) / max}%` }} />
          </span>
          <span className="w-10 text-right font-mono text-xs text-muted-foreground">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function UsersTab() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const { data, isLoading } = useAdminUsers(page, q);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4" data-testid="users-search-card">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
               placeholder="Search by name or email…" className="max-w-sm" data-testid="admin-user-search-input" />
        {data ? <span className="text-xs text-muted-foreground">{data.total} users</span> : null}
      </div>
      <div className="rounded-2xl border border-border bg-card" data-testid="admin-users-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Journey</TableHead>
              <TableHead>Tasks done</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}><Loader2 className="size-4 animate-spin" aria-hidden /></TableCell></TableRow>
            ) : data?.users.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No users match.</TableCell></TableRow>
            ) : data?.users.map((u) => (
              <TableRow key={u.id} data-testid={`admin-user-row-${u.email}`}>
                <TableCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell><span className="font-mono text-xs">{u.role}</span></TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <StatusDot status={u.journey_status === "active" ? "partial" : "not_started"} />
                    {u.journey_status}{u.current_day ? ` · day ${u.current_day}` : ""}
                  </span>
                </TableCell>
                <TableCell><span className="font-mono text-xs">{u.tasks_done}</span></TableCell>
                <TableCell>{u.email_verified ? <Check /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && data.total > data.limit ? (
        <div className="flex items-center justify-end gap-2" data-testid="users-pagination">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="font-mono text-xs text-muted-foreground">{data.page} / {Math.ceil(data.total / data.limit)}</span>
          <Button variant="outline" size="sm" disabled={data.page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}

function RoadmapTab() {
  const [day, setDay] = useState("1");
  const dayNum = Math.min(180, Math.max(1, Number(day) || 1));
  const { data, isLoading } = useRoadmapDay(dayNum);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  const value = dirty ? draft : data ? JSON.stringify({ title: data.title, dsa: data.dsa, mern: data.mern, revision: data.revision }, null, 2) : "";

  const save = async () => {
    try {
      const parsed = JSON.parse(draft || value) as Partial<RoadmapDayOut>;
      await apiPut<RoadmapDayOut>(`/admin/roadmap/day/${dayNum}`, parsed);
      setDirty(false);
      toast.success(`Roadmap day ${dayNum} updated`);
    } catch (e) {
      toast.error(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6" data-testid="roadmap-editor-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-day">Day (1–180)</Label>
          <Input id="roadmap-day" type="number" min={1} max={180} value={day}
                 onChange={(e) => { setDay(e.target.value); setDirty(false); }} className="w-32"
                 data-testid="roadmap-editor-day-input" />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          Edit the master roadmap here — changes apply app-wide without touching code.
        </p>
      </div>
      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading day…</p>
      ) : (
        <>
          <Textarea rows={18} value={value} onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
                    className="font-mono text-xs" data-testid="roadmap-editor-textarea" />
          <Button onClick={() => void save()} disabled={!dirty} data-testid="roadmap-editor-save-button">Save day {dayNum}</Button>
        </>
      )}
    </div>
  );
}

function RemindersTab() {
  const { mutate: send, isPending } = useSendReminders();
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6" data-testid="reminders-card">
      <h2 className="font-heading font-bold">Daily reminder dispatch</h2>
      <p className="text-sm text-muted-foreground">
        Sends an email study reminder to every opted-in user whose current day still has pending
        tasks. The same dispatch runs on schedule via the platform cron (daily at 18:30 IST).
      </p>
      <Button onClick={() => send(undefined, { onSuccess: (m) => toast(m.message) })} disabled={isPending}
              data-testid="send-reminders-button">
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        Send now
      </Button>
    </div>
  );
}

function Check() {
  return <span className="text-xs font-semibold text-emerald-500">verified</span>;
}
