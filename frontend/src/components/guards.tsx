// Route guards: auth gate, journey gate, admin gate, guest gate.
// Auth rides the httpOnly cookie; /auth/me is the single source of truth.
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { useJourney } from "@/hooks/useData";

export function FullLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background text-foreground">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}

export function Protected() {
  const { isLoading, isError } = useMe();
  const location = useLocation();
  if (isLoading) return <FullLoader label="Checking your session" />;
  if (isError) {
    return <Navigate to="/login" state={{ next: location.pathname }} replace />;
  }
  return <Outlet />;
}

export function RequireJourney() {
  const { isLoading, isError, data } = useJourney();
  if (isLoading) return <FullLoader label="Loading your journey" />;
  if (isError) return <Navigate to="/login" replace />;
  if (!data?.journey) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  if (me && me.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center" data-testid="admin-forbidden">
        <ShieldAlert className="size-10 text-destructive" aria-hidden />
        <h2 className="font-heading text-2xl font-bold">Admins only</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This dashboard is restricted to the application owner. Your account
          ({me.email}) has role <span className="font-mono">{me.role}</span>.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

export function GuestOnly() {
  const { isLoading, isError } = useMe();
  if (isLoading) return <FullLoader label="Loading" />;
  if (!isError) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
