import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Flame, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLogin } from "@/hooks/useAuth";
import { ApiError, detailOf } from "@/lib/api";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { mutateAsync: login, isPending } = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState("");
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError("");
    try {
      const challenge = await login(values);
      toast.success(challenge.message);
      navigate("/verify-login", {
        replace: true,
        state: {
          email: challenge.email,
          remember: values.remember,
          next: (location.state as { next?: string } | null)?.next,
        },
      });
    } catch (err) {
      const message = detailOf(err) ?? (err instanceof ApiError ? "Sign in failed" : "Sign in failed");
      setFormError(message);
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2" data-testid="login-page">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex" aria-hidden>
        <div className="pointer-events-none absolute inset-0"
             style={{ background: "radial-gradient(ellipse at bottom left, rgba(20,184,166,0.18) 0%, transparent 60%)" }} />
        <Link to="/" className="relative flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">180</span>
          <span className="font-heading text-lg font-bold">180Days</span>
        </Link>
        <div className="relative space-y-6">
          <h2 className="font-heading text-3xl font-bold leading-tight">Welcome back to your<br />180-day journey.</h2>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4">
            <Flame className="size-8 text-amber-500" aria-hidden />
            <div>
              <p className="font-heading font-bold">7 days</p>
              <p className="text-xs text-muted-foreground">the average weekly streak after month one</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4">
            <LockKeyhole className="size-8 text-primary" aria-hidden />
            <div>
              <p className="font-heading font-bold">Session stays on your device</p>
              <p className="text-xs text-muted-foreground">httpOnly cookie — nothing sensitive in your browser storage</p>
            </div>
          </div>
        </div>
        <p className="relative text-xs text-muted-foreground">Master DSA & MERN in 180 focused days.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden" data-testid="login-mobile-brand">
            <span className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">180</span>
            <span className="font-heading text-lg font-bold">180Days</span>
          </Link>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Continue exactly where you left off.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com"
                     {...register("email")} data-testid="login-email-input" />
              {errors.email ? <p className="text-xs text-destructive" data-testid="login-email-error">{errors.email.message}</p> : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline" data-testid="forgot-link">Forgot password?</Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••"
                     {...register("password")} data-testid="login-password-input" />
              {errors.password ? <p className="text-xs text-destructive" data-testid="login-password-error">{errors.password.message}</p> : null}
            </div>
            <label className="flex items-center gap-2 text-sm" data-testid="remember-me-row">
              <Checkbox checked={watch("remember")} onCheckedChange={(v) => setValue("remember", v === true)}
                        data-testid="remember-me-checkbox" />
              Keep me signed in for 30 days
            </label>

            {formError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="login-form-error">
                {formError}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isPending} data-testid="login-submit-button">
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
              Sign in
            </Button>

            <Button type="button" variant="outline" className="w-full"
                    onClick={() => { setValue("email", "demo@180days.app"); setValue("password", "Demo1234"); }}
                    data-testid="login-demo-button">
              Fill demo account (demo@180days.app)
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link to="/signup" className="font-semibold text-primary hover:underline" data-testid="signup-link">Create an account</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
