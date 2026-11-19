import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSignup } from "@/hooks/useAuth";
import { detailOf } from "@/lib/api";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Enter your full name").max(80),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[a-zA-Z]/, "Needs at least one letter")
    .regex(/[0-9]/, "Needs at least one number"),
  confirm_password: z.string(),
}).refine((v) => v.password === v.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});
type FormValues = z.infer<typeof schema>;

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return {
    score,
    label: ["Too weak", "Weak", "Fair", "Good", "Strong", "Excellent"][score],
  };
}

export default function Signup() {
  const { mutateAsync: signup, isPending } = useSignup();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirm_password: "" },
  });
  const pw = watch("password");
  const pwStrength = strength(pw ?? "");

  const onSubmit = async (values: FormValues) => {
    setFormError("");
    try {
      const result = await signup(values);
      toast.success("Account created.");
      navigate("/verify-email", {
        replace: true,
        state: { verificationEmailSent: result.verification_email_sent === true },
      });
    } catch (err) {
      const detail = detailOf(err);
      setFormError(detail ?? "Signup failed — try again");
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2" data-testid="signup-page">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex" aria-hidden>
        <div className="pointer-events-none absolute inset-0"
             style={{ background: "radial-gradient(ellipse at top left, rgba(6,182,212,0.15) 0%, transparent 55%)" }} />
        <Link to="/" className="relative flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">180</span>
          <span className="font-heading text-lg font-bold">180Days</span>
        </Link>
        <div className="relative space-y-4">
          <h2 className="font-heading text-3xl font-bold leading-tight">One decision today,<br />a portfolio in 180 days.</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">✓</span> Your journey starts on YOUR date — not a global cohort</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> 419 Striver A2Z DSA problems with difficulty tracking</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> MERN syllabus, weekly mocks, monthly checkpoints</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> Progress saved to your account — continue on any device</li>
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">Free forever for personal use.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden" data-testid="signup-mobile-brand">
            <span className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">180</span>
            <span className="font-heading text-lg font-bold">180Days</span>
          </Link>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Your journey starts the moment you confirm it.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" data-testid="signup-form">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" autoComplete="name" placeholder="Ada Lovelace" {...register("name")} data-testid="signup-name-input" />
              {errors.name ? <p className="text-xs text-destructive" data-testid="signup-name-error">{errors.name.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} data-testid="signup-email-input" />
              {errors.email ? <p className="text-xs text-destructive" data-testid="signup-email-error">{errors.email.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" placeholder="8+ characters, 1 number" {...register("password")} data-testid="signup-password-input" />
              {errors.password ? <p className="text-xs text-destructive" data-testid="signup-password-error">{errors.password.message}</p> : null}
              {pw ? (
                <div className="flex items-center gap-2" data-testid="password-strength-meter">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={cn("h-1.5 flex-1 rounded-full",
                        i < pwStrength.score ? (pwStrength.score >= 4 ? "bg-emerald-500" : "bg-amber-500") : "bg-muted")} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{pwStrength.label}</span>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input id="confirm_password" type="password" autoComplete="new-password" placeholder="Repeat your password"
                     {...register("confirm_password")} data-testid="signup-confirm-input" />
              {errors.confirm_password ? <p className="text-xs text-destructive" data-testid="signup-confirm-error">{errors.confirm_password.message}</p> : null}
            </div>

            {formError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="signup-form-error">
                {formError}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isPending} data-testid="signup-submit-button">
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
              Create account
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              We'll email you a one-time verification code. By signing up you accept our{" "}
              <Link to="/terms" className="underline">Terms</Link> and{" "}
              <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline" data-testid="login-link">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
