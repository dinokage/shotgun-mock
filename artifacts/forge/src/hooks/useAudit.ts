import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface AuditLogDTO {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  details: any;
  createdAt: string;
}

export function useAudit(projectId?: string, entityId?: string) {
  return useQuery({
    queryKey: ["audit", { projectId, entityId }],
    queryFn: () => {
      let url = "/audit";
      const params = new URLSearchParams();
      if (projectId) params.append("projectId", projectId);
      if (entityId) params.append("entityId", entityId);
      if (params.toString()) url += `?${params.toString()}`;
      return apiFetch<AuditLogDTO[]>(url);
    },
  });
}
