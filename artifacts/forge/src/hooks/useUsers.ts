import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useMemo } from "react";

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
