import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useMemo } from "react";
import { User } from "@/data/mockData";
export type UserDTO = User;
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
