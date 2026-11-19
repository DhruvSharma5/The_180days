import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResetPassword } from "@/hooks/useAuth";
import { detailOf } from "@/lib/api";

const schema = z.object({
  password: z.string().min(8, "At least 8 characters").regex(/[a-zA-Z]/, "Needs a letter").regex(/[0-9]/, "Needs a number"),
  confirm_password: z.string(),
}).refine((v) => v.password === v.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});
type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { mutateAsync: reset, isPending, isSuccess } = useResetPassword();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm_password: "" },
  });

  if (!token) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6" data-testid="reset-password-page">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">This page needs a reset link from your email.</p>
          <Button className="mt-4" render={<Link to="/forgot-password" data-testid="reset-goto-forgot" />}>
            Request a new link
          </Button>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setFormError("");
    try {
      await reset({ token, password: values.password });
      toast.success("Password updated — sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      const detail = detailOf(err);
      setFormError(detail ?? "Reset failed — request a new link");
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6" data-testid="reset-password-page">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-center font-heading text-2xl font-bold">Choose a new password</h1>
        {isSuccess ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">Done — redirecting to sign in…</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" data-testid="reset-form">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register("password")} data-testid="reset-password-input" />
              {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input id="confirm_password" type="password" autoComplete="new-password" {...register("confirm_password")} data-testid="reset-confirm-input" />
              {errors.confirm_password ? <p className="text-xs text-destructive">{errors.confirm_password.message}</p> : null}
            </div>
            {formError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="reset-form-error">
                {formError}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={isPending} data-testid="reset-submit-button">
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
