import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight, CalendarCheck, CheckCircle2, Flame, FolderKanban, Layers,
  LineChart, Moon, Sun, Target, Timer, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { formatDayDate } from "@/components/bits";

const FEATURES = [
  { icon: CalendarCheck, title: "Daily task tracker", sub: "Every DSA problem, MERN topic and revision item for the day — checked off, saved, never lost." },
  { icon: Flame, title: "Streak engine", sub: "Streaks count real completed tasks, not logins. Missed and partial days are shown honestly." },
  { icon: Undo2, title: "Spaced revision", sub: "Yesterday's problems, 7-day refreshers, weekly redo sessions — the planner's revision system, automated." },
  { icon: Target, title: "Weekly self-mocks", sub: "Score every 45-minute mock from 1 to 5 and watch the trend line move." },
  { icon: FolderKanban, title: "Project milestones", sub: "Three portfolio projects with checklists, repos and live links tracked to completion." },
  { icon: LineChart, title: "Analytics that matter", sub: "DSA / MERN / revision completion, momentum and mock performance — all computed from your data." },
];

export default function Landing() {
  const { theme, setTheme } = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="min-h-svh bg-background text-foreground" data-testid="landing-page">
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">180</span>
            <span className="font-heading text-lg font-bold tracking-tight">180Days</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    aria-label="Toggle theme" data-testid="landing-theme-toggle">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" render={<Link to="/login" data-testid="landing-login-link" />}>Sign in</Button>
            <Button render={<Link to="/signup" data-testid="landing-signup-link" />}>Get started</Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0"
             style={{ background: "radial-gradient(ellipse at top, rgba(19,45,80,0.55) 0%, transparent 65%)" }} />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary" data-testid="landing-badge">
              <Timer className="size-3.5" aria-hidden /> 180 days · DSA + MERN
            </span>
            <h1 className="mt-5 font-heading text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl" data-testid="landing-headline">
              Master DSA & MERN in 180 focused days.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg" data-testid="landing-sub">
              Your complete roadmap, turned into an interactive tracker. Start on your own
              date, tick real problems, protect your streak, and finish with three deployed
              projects and interview-ready skills.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" render={<Link to="/signup" data-testid="landing-cta-start" />}>
                Start my journey <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" render={<Link to="/login" data-testid="landing-cta-login" />}>
                I already have an account
              </Button>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4" data-testid="landing-stats">
              {[["180", "days planned"], ["419", "A2Z DSA problems"], ["3", "portfolio projects"]].map(([v, l]) => (
                <div key={l} className="rounded-xl border border-border bg-card/70 p-3 text-center">
                  <dt className="font-heading text-2xl font-bold">{v}</dt>
                  <dd className="text-xs text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Sample day preview card */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                      className="rounded-2xl border border-border bg-card p-6 shadow-xl" data-testid="landing-preview-card">
            <div className="flex items-center justify-between">
              <p className="font-heading font-bold">Day 24 — sample</p>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-500">
                🔥 7-day streak
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatDayDate(today)} · Weekly revision & mock</p>
            <div className="mt-4 space-y-2">
              {[
                { t: "Two Sum II — Sorted Input", d: "Medium", done: true },
                { t: "Trapping Rain Water", d: "Hard", done: true },
                { t: "Learn & practice: JWT authentication", d: null, done: false },
                { t: "Revise the DSA problems from 7 days ago", d: null, done: false },
                { t: "Complete the 45-minute weekly self-mock", d: null, done: false },
              ].map((task) => (
                <div key={task.t} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5">
                  <CheckCircle2 className={`size-4 shrink-0 ${task.done ? "text-primary" : "text-muted-foreground/40"}`} aria-hidden />
                  <span className={`flex-1 text-sm ${task.done ? "text-muted-foreground line-through" : ""}`}>{task.t}</span>
                  {task.d ? (
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      task.d === "Medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-400"}`}>
                      {task.d}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[52%] rounded-full bg-primary" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Overall progress 18% — computed from your real completions</p>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="landing-features">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }} transition={{ duration: 0.35, delay: i * 0.05 }}
                        className="rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <f.icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-heading font-bold">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-muted-foreground">
          <p>180Days — learn in public, track in private.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground" data-testid="footer-privacy">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground" data-testid="footer-terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
