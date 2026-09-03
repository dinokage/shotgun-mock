import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface AuditLogDTO {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  targetEntityType: string;
  targetEntityId: string;
  metadata: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  createdAt: string;
}

export function useAuditLogs(entityId?: string) {
  return useQuery<AuditLogDTO[]>({
    queryKey: ["audit-logs", entityId ?? "all"],
    queryFn: () =>
      apiFetch<AuditLogDTO[]>(
        entityId
          ? `/audit-logs?entityId=${encodeURIComponent(entityId)}`
          : "/audit-logs",
      ),
    staleTime: 10000,
  });
}
