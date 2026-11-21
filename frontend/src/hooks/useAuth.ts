// Auth hooks: one shared /auth/me query + typed mutations for every auth flow.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type {
  AuthOut, ChangePasswordBody, LoginBody, LoginChallengeOut, LoginVerifyBody,
  MessageOut, ProfileUpdateBody,
  ResetBody, SignupBody, UserOut,
} from "@/types";

export const ME_KEY = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiGet<UserOut>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

function useInvalidateMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ME_KEY });
}

export function useSignup() {
  const invalidateMe = useInvalidateMe();
  return useMutation({
    mutationFn: (body: SignupBody) => apiPost<AuthOut>("/auth/signup", body),
    onSuccess: (data) => {
      beginSession();
      invalidateMe();
      void data;
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginBody) => apiPost<LoginChallengeOut>("/auth/login", body),
  });
}

export function useVerifyLoginCode() {
  const invalidateMe = useInvalidateMe();
  return useMutation({
    mutationFn: (body: LoginVerifyBody) => apiPost<AuthOut>("/auth/verify-login-code", body),
    onSuccess: () => {
      beginSession();
      invalidateMe();
    },
  });
}
export function useLogout() {
  return useMutation({ mutationFn: () => apiPost<MessageOut>("/auth/logout") });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => apiPost<MessageOut>("/auth/forgot-password", { email }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetBody) => apiPost<MessageOut>("/auth/reset-password", body),
  });
}

export function useVerifyEmail() {
  const invalidateMe = useInvalidateMe();
  return useMutation({
    mutationFn: (token: string) => apiPost<MessageOut>("/auth/verify-email", { token }),
    onSuccess: invalidateMe,
  });
}

export function useVerifyEmailCode() {
  const invalidateMe = useInvalidateMe();
  return useMutation({
    mutationFn: (code: string) => apiPost<MessageOut>("/auth/verify-email-code", { code }),
    onSuccess: invalidateMe,
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => apiPost<MessageOut>("/auth/resend-verification"),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      apiPost<MessageOut>("/auth/change-password", body),
  });
}

export function useUpdateProfile() {
  const invalidateMe = useInvalidateMe();
  return useMutation({
    mutationFn: (body: ProfileUpdateBody) => apiPatch<UserOut>("/users/me", body),
    onSuccess: () => invalidateMe(),
  });
}
