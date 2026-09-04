import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";
import { useMemo } from "react";
import { useAuthStore } from "@/store/auth";

export interface UserDTO {
  id: string;
  tenantId: string;
  roleId: string;
  role: string | null;
  departmentId: string | null;
  email: string;
  name: string;
  title: string | null;
  avatar: string | null;
  status: string | null;
  punchedInAt: string | null;
  createdAt: string;
}

export function useUsers() {
  return useQuery<UserDTO[]>({
    queryKey: ["users"],
    queryFn: async () => apiFetch<UserDTO[]>("/users"),
    staleTime: 60000,
  });
}
export function useSendInvite() {
  return useMutation({
    mutationFn: (body: { email: string; roleId: string; departmentId?: string }) =>
      apiClient.post<{ email: string; roleId: string; expiresAt: string }>(
        "/invites",
        body,
      ),
  });
}

export function useUsersMap() {
  const { data: users = [] } = useUsers();
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}

// Self-service profile edit -- PATCH /users/me, self-only, no
// manage_members capability required (contrast with admin.tsx's
// PATCH /users/:id reassignment calls, which are raw apiFetch() calls
// gated behind manage_members). On success, merge the updated row into
// both the ["users"] cache and useAuthStore's currentUser/mock USERS
// entry so TopBar and profile.tsx reflect the change immediately.
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      title?: string | null;
      avatar?: string | null;
    }) => apiClient.patch<UserDTO>("/users/me", body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      // Only pass the fields this route can change -- the mock User type
      // (store/auth.ts's UserDTO) declares title/avatar/role as non-nullable
      // strings while the API's UserDTO allows null, so build a narrow,
      // explicitly-typed object rather than passing `updated` through as-is.
      useAuthStore.getState().updateCurrentUser({
        name: updated.name,
        title: updated.title ?? undefined,
        avatar: updated.avatar ?? undefined,
      });
    },
  });
}

// Self-service password change -- every imported-roster/newly-invited
// account starts on a shared studio default password with no prior way to
// change it. Requires the current password (PUT /users/me/password verifies
// it server-side); ApiError's message here is server-authored ("Current
// password is incorrect", "New password must be at least 8 characters") so
// callers can surface it directly rather than a generic failure toast.
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiClient.put<{ ok: true }>("/users/me/password", body),
  });
}

// Real punch clock, replacing the old per-browser localStorage timer
// (TimeClockWidget.tsx) that no other user or device could ever see and
// that reset on every login. Mirrors useUpdateProfile's cache/store sync so
// the header widget, daily-standup.tsx's Payroll table, and analytics.tsx
// all reflect the change immediately instead of waiting on the next 10s
// fetchMe() poll.
export function usePunchIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<UserDTO>("/users/me/punch-in", {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      useAuthStore.getState().updateCurrentUser({
        punchedInAt: updated.punchedInAt,
      });
    },
  });
}

export function usePunchOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<UserDTO>("/users/me/punch-out", {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      useAuthStore.getState().updateCurrentUser({
        punchedInAt: updated.punchedInAt,
      });
    },
  });
}

// Mirrors useUpdateProfile's cache/store sync -- POST /users/me/avatar
// returns the full updated user row (like PATCH /users/me), just via a
// multipart upload instead of a JSON body.
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<UserDTO>("/users/me/avatar", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      useAuthStore.getState().updateCurrentUser({
        name: updated.name,
        title: updated.title ?? undefined,
        avatar: updated.avatar ?? undefined,
      });
    },
  });
}
