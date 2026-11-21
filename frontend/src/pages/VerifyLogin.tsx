import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVerifyLoginCode } from "@/hooks/useAuth";
import { detailOf } from "@/lib/api";

export default function VerifyLogin() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as
    | { email?: string; remember?: boolean; next?: string }
    | null;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const verification = useVerifyLoginCode();

  if (!state?.email) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="font-heading text-2xl font-bold">Sign in required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your password to receive a sign-in verification code.
          </p>
          <Button className="mt-6" render={<Link to="/login" />}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }
  const email = state.email;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await verification.mutateAsync({
        email,
        code,
        remember: state.remember !== false,
      });
      const next =
        state.next && state.next !== "/onboarding" ? state.next : "/dashboard";
      navigate(next, { replace: true });
    } catch (err) {
      setError(detailOf(err) ?? "Could not verify this sign-in code.");
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="mt-4 font-heading text-2xl font-bold">
          Verify your sign-in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the six-digit code sent to <strong>{email}</strong>. The
          code expires in 10 minutes.
        </p>
        {error ? (
          <p
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2 text-left">
            <Label htmlFor="login-verification-code">Verification code</Label>
            <Input
              id="login-verification-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              required
            />
          </div>
          <Button
            className="w-full"
            type="submit"
            disabled={code.length !== 6 || verification.isPending}
          >
            {verification.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Verify and sign in
          </Button>
        </form>
        <Button
          className="mt-3 w-full"
          type="button"
          variant="outline"
          render={<Link to="/login" />}
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
