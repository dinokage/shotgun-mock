import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

export type AuditEntityType = "asset" | "shot";

/**
 * The rollback bookkeeping for one entity: the audit-log timestamp it is
 * currently showing state as of, plus the real field values captured
 * immediately before the *first* rollback in a chain was applied — what
 * "Restore latest" puts back. Both live server-side, so one person's rollback
 * is visible to everyone instead of only to the browser that performed it.
 */
export interface AuditRollbackDTO {
  entityType: AuditEntityType;
  entityId: string;
  rolledBackTo: string;
  snapshot: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
}

// entityType is deliberately optional: the Time Travel page knows an entity's
// id before it knows its kind (which it reads off that entity's audit rows).
export function useAuditRollback(entityId: string | undefined) {
  return useQuery<AuditRollbackDTO | null>({
    queryKey: ["audit-rollback", entityId],
    queryFn: () =>
      apiFetch<AuditRollbackDTO | null>(
        `/audit-rollbacks?entityId=${encodeURIComponent(entityId!)}`,
      ),
    enabled: !!entityId,
    staleTime: 10000,
  });
}

// The server applies the rollback to the real Asset/Shot row and writes an
// audit entry for it, so every list built from those tables is stale after
// this resolves.
function invalidateRolledBackEntity(
  queryClient: ReturnType<typeof useQueryClient>,
  entityId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["audit-rollback", entityId] });
  queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  queryClient.invalidateQueries({ queryKey: ["assets"] });
  queryClient.invalidateQueries({ queryKey: ["shots"] });
}

export function useRollbackEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      entityType: AuditEntityType;
      entityId: string;
      rolledBackTo: string;
    }) => apiClient.post<AuditRollbackDTO>("/audit-rollbacks", body),
    onSuccess: (_data, variables) =>
      invalidateRolledBackEntity(queryClient, variables.entityId),
  });
}

export function useClearAuditRollback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: AuditEntityType; entityId: string }) =>
      apiClient.delete(`/audit-rollbacks/${entityType}/${encodeURIComponent(entityId)}`),
    onSuccess: (_data, variables) =>
      invalidateRolledBackEntity(queryClient, variables.entityId),
  });
}
