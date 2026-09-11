import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

interface PasswordMessageResponse {
  message: string;
}

// POST /auth/forgot-password answers 200 with the same message whether or not
// the address exists, so callers must render whatever comes back verbatim
// rather than deriving "we found you" copy from a successful response.
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      apiClient.post<PasswordMessageResponse>("/auth/forgot-password", body),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; newPassword: string }) =>
      apiClient.post<PasswordMessageResponse>("/auth/reset-password", body),
  });
}

// Revokes every session the user holds, the caller's own included -- the
// session cookie is dead by the time this resolves, so the caller has to send
// the user to /login instead of leaving them on a page that will start 401ing.
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiClient.post<PasswordMessageResponse>("/auth/change-password", body),
  });
}
