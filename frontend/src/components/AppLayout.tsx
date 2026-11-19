// App shell: desktop sidebar + glass header, mobile slim header + bottom nav + drawer.
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  BadgeCheck, CalendarCheck, CalendarDays, Code2, Flag, Flame, FolderKanban,
  Layers, LayoutDashboard, LogOut, Menu, MessagesSquare, Moon, RotateCcw,
  ShieldCheck, Sun, Target, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMe } from "@/hooks/useAuth";
import { useSummary } from "@/hooks/useData";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/daily-tracker", label: "Daily Tracker", icon: CalendarCheck },
  { to: "/calendar", label: "180-Day Calendar", icon: CalendarDays },
  { to: "/roadmap/dsa", label: "DSA Roadmap", icon: Code2 },
  { to: "/roadmap/mern", label: "MERN Roadmap", icon: Layers },
  { to: "/revision", label: "Revision", icon: RotateCcw },
  { to: "/mocks", label: "Weekly Mocks", icon: Target },
  { to: "/checkpoints", label: "Checkpoints", icon: Flag },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/interview-prep", label: "Interview Prep", icon: MessagesSquare },
];

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/daily-tracker", label: "Daily", icon: CalendarCheck },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/mocks", label: "Mocks", icon: Target },
  { to: "/profile", label: "Profile", icon: UserRound },
];

function BrandMark() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2 px-2" data-testid="brand-link">
      <span className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">
        180
      </span>
      <span className="font-heading text-lg font-bold tracking-tight">180Days</span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { data: me } = useMe();
  return (
    <nav className="flex flex-col gap-1" data-testid="sidebar-nav">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isActive && "bg-sidebar-accent text-sidebar-foreground shadow-[inset_2px_0_0_var(--primary)]",
            )
          }
          data-testid={`nav-${item.to.replace(/\//g, "-").replace(/^-/, "")}`}
        >
          <item.icon className="size-4 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}
      {me?.role === "admin" ? (
        <NavLink
          to="/admin"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "mt-2 flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isActive && "bg-sidebar-accent text-sidebar-foreground",
            )
          }
          data-testid="nav-admin"
        >
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Admin
        </NavLink>
      ) : null}
    </nav>
  );
}

export default function AppLayout() {
  const { data: me } = useMe();
  const { data: summary } = useSummary();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  const signOut = async () => {
    await endSession("/login");
    navigate("/login", { replace: true });
  };

  const dayPill = summary && summary.journey_status !== "not_started" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs font-medium" data-testid="day-pill">
      Day {summary.current_day} / 180
    </span>
  ) : null;

  const streakChip = summary && summary.journey_status !== "not_started" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs font-semibold text-amber-500 dark:text-amber-400" data-testid="streak-chip">
      <Flame className="size-3.5" aria-hidden /> {summary.streak_current}
    </span>
  ) : null;

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between border-r border-sidebar-border bg-sidebar p-4 lg:flex" data-testid="sidebar">
        <div>
          <BrandMark />
          <div className="mt-6"><NavLinks /></div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sidebar-border bg-card/60 p-3" data-testid="profile-pill">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" data-testid="sidebar-user-name">{me?.name ?? "…"}</p>
            <p className="truncate text-xs text-muted-foreground">{me?.email}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" data-testid="sign-out-button">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Mobile slim header */}
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:hidden" data-testid="mobile-header">
          <BrandMark />
          <div className="flex items-center gap-2">
            {dayPill}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger render={
                <Button variant="ghost" size="icon" aria-label="Open menu" data-testid="menu-button">
                  {drawerOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </Button>
              } />
              <SheetContent side="right" className="w-72 bg-sidebar p-4" data-testid="mobile-drawer">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="mb-4"><BrandMark /></div>
                <NavLinks onNavigate={() => setDrawerOpen(false)} />
                <div className="mt-4 flex items-center justify-between border-t border-sidebar-border pt-4">
                  <span className="truncate text-xs text-muted-foreground">{me?.email}</span>
                  <div className="flex gap-1">
                    <ThemeToggle />
                    <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" data-testid="sign-out-button-mobile">
                      <LogOut className="size-4" />
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Desktop glass header */}
        <header className="sticky top-0 z-40 hidden h-16 items-center justify-end gap-3 border-b border-border bg-background/70 px-8 backdrop-blur-xl lg:flex" data-testid="desktop-header">
          {dayPill}
          {streakChip}
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 pb-28 lg:p-8 lg:pb-12" data-testid="app-main">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-background/90 backdrop-blur-xl lg:hidden"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }} data-testid="bottom-nav">
        {BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn("flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground",
                 isActive && "text-primary")
            }
            data-testid={`bottom-nav-${item.label.toLowerCase()}`}
          >
            {({ isActive }) => (
              <>
                <span className={cn("grid size-9 place-items-center rounded-full transition-colors", isActive && "bg-primary/15")}>
                  <item.icon className="size-5" aria-hidden />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Verification banner */}
      {me && !me.email_verified ? (
        <div className="fixed inset-x-0 bottom-16 z-30 flex items-center justify-center px-4 lg:bottom-4" data-testid="verify-banner">
          <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 shadow-md">
            <BadgeCheck className="size-4 shrink-0" aria-hidden />
            <Link to="/verify-email" className="hover:underline">
              Verify your email — enter the code from your inbox.
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
