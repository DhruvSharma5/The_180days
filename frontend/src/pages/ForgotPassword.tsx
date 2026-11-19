import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForgotPassword } from "@/hooks/useAuth";

export default function ForgotPassword() {
  const { mutateAsync: forgot, isPending, isSuccess, data } = useForgotPassword();
  const [email, setEmail] = useState("");

  return (
    <div className="flex min-h-svh items-center justify-center p-6" data-testid="forgot-password-page">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-login-link">
          <ArrowLeft className="size-4" aria-hidden /> Back to sign in
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <MailCheck className="size-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-center font-heading text-2xl font-bold">Forgot your password?</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your account email and we'll send a secure reset link. The link expires in
            one hour and works only once.
          </p>

          {isSuccess ? (
            <p className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-600 dark:text-emerald-400" data-testid="forgot-success-message">
              {data?.message ?? "Check your inbox for the reset link."}
            </p>
          ) : (
            <form
              className="mt-6 space-y-4"
              data-testid="forgot-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await forgot(email);
                } catch {
                  // identical response either way — no account enumeration
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                       placeholder="you@example.com" autoComplete="email" data-testid="forgot-email-input" />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={isPending} data-testid="forgot-submit-button">
                {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Send reset link
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
