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
  createdAt: string;
}

export function useUsers() {
  return useQuery<UserDTO[]>({
    queryKey: ["users"],
    queryFn: async () => apiFetch<UserDTO[]>("/users"),
    staleTime: 60000,
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
