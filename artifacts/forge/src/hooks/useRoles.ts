import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

// POST/PATCH /api/users validate `roleId` against the tenant_roles table by
// its real (random UUID) id — the role NAME string ("admin", "producer", …)
// is not a valid roleId. This hook backs the Admin Panel's "create user"
// role picker so it can submit an actual roleId instead of a name string.
export interface TenantRoleDTO {
  id: string;
  name: string;
}

export function useRoles() {
  return useQuery<TenantRoleDTO[]>({
    queryKey: ["roles"],
    queryFn: () => apiFetch<TenantRoleDTO[]>("/roles"),
    staleTime: 60000,
  });
}
