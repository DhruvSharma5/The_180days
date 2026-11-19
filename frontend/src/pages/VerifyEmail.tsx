import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { BadgeCheck, CircleX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe, useResendVerification, useVerifyEmail, useVerifyEmailCode } from "@/hooks/useAuth";
import { detailOf } from "@/lib/api";

export default function VerifyEmail() {
  const location = useLocation();
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token"));
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const ran = useRef(false);
  const state = location.state as { verificationEmailSent?: boolean } | null;
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const {
    mutate: verifyLink,
    isPending: linkPending,
    isSuccess: linkSuccess,
    isError: linkError,
  } = useVerifyEmail();
  const codeVerification = useVerifyEmailCode();
  const resend = useResendVerification();

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    verifyLink(token);
  }, [token, verifyLink]);

  const verified = linkSuccess || codeVerification.isSuccess || me?.email_verified;

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await codeVerification.mutateAsync(code);
    } catch (err) {
      setError(detailOf(err) ?? "Could not verify this code. Please try again.");
    }
  };

  const resendCode = async () => {
    setError("");
    setResendMessage("");
    try {
      const result = await resend.mutateAsync();
      setResendMessage(result.message);
    } catch (err) {
      setError(detailOf(err) ?? "Could not send a new verification code.");
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6" data-testid="verify-email-page">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        {verified ? (
          <>
            <BadgeCheck className="mx-auto size-10 text-emerald-500" aria-hidden />
            <h1 className="mt-4 font-heading text-2xl font-bold">Email verified</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your account is fully activated.</p>
            <Button className="mt-6" render={<Link to={me ? "/dashboard" : "/login"} data-testid="verify-continue-link" />}>
              Continue to 180Days
            </Button>
          </>
        ) : token && linkPending ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">Checking your verification link…</p>
          </>
        ) : meLoading ? (
          <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
        ) : meError || !me ? (
          <>
            <CircleX className="mx-auto size-10 text-destructive" aria-hidden />
            <h1 className="mt-4 font-heading text-2xl font-bold">Sign in to verify your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to enter the six-digit code sent to your email.
            </p>
            <Button className="mt-6" render={<Link to="/login" />}>Sign in</Button>
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-bold">Verify your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the six-digit code sent to <strong>{me.email}</strong>. It expires in 10 minutes.
            </p>
            {state?.verificationEmailSent === false ? (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-700 dark:text-amber-300">
                The email service is not configured for this environment. Configure the provider, then request a new code.
              </p>
            ) : null}
            {linkError ? (
              <p className="mt-4 text-left text-sm text-destructive">
                This link is invalid or expired. You can enter a current code or request a new one.
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {resendMessage ? (
              <p className="mt-4 text-sm text-emerald-600" role="status">{resendMessage}</p>
            ) : null}
            <form onSubmit={submitCode} className="mt-6 space-y-4">
              <div className="space-y-2 text-left">
                <Label htmlFor="verification-code">Verification code</Label>
                <Input
                  id="verification-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  data-testid="verification-code-input"
                />
              </div>
              <Button className="w-full" type="submit" disabled={code.length !== 6 || codeVerification.isPending}>
                {codeVerification.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Verify email
              </Button>
            </form>
            <Button
              className="mt-3 w-full"
              type="button"
              variant="outline"
              onClick={resendCode}
              disabled={resend.isPending}
              data-testid="resend-verification-button"
            >
              {resend.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Resend code
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
