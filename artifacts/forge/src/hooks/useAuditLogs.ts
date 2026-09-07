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

// Requires a real entityId -- the one caller (Time Travel) previously passed
// "" before anything was selected, which this hook silently treated as
// "fetch every audit log in the tenant, unfiltered". That made the page look
// like it was showing history for an entity that was never actually chosen,
// and every "Rollback" click against that unfiltered/empty-id state silently
// did nothing (no log row's entityId ever matches ""), with no indication to
// the user that the click had no effect.
export function useAuditLogs(entityId: string | undefined) {
  return useQuery<AuditLogDTO[]>({
    queryKey: ["audit-logs", entityId],
    queryFn: () =>
      apiFetch<AuditLogDTO[]>(`/audit-logs?entityId=${encodeURIComponent(entityId!)}`),
    enabled: !!entityId,
    staleTime: 10000,
  });
}
