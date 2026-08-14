import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Records, per entity, the audit-log timestamp a user last rolled back to.
 * This is what makes "Rollback" on /audit a real, persisted state change
 * rather than a toast that vanishes and changes nothing: any audit event
 * newer than the rollback point is rendered as reverted/discarded the next
 * time the entity's timeline is viewed, and survives reload/navigation.
 */
interface AuditState {
  /** entityId -> timestamp string rolled back to (audit events use lexicographically-sortable 'YYYY-MM-DD HH:MM:SS'). */
  rollbackPoints: Record<string, string>;
  rollbackEntity: (entityId: string, timestamp: string) => void;
  clearRollback: (entityId: string) => void;
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      rollbackPoints: {},
      rollbackEntity: (entityId, timestamp) =>
        set((state) => ({
          rollbackPoints: { ...state.rollbackPoints, [entityId]: timestamp },
        })),
      clearRollback: (entityId) =>
        set((state) => {
          const rollbackPoints = { ...state.rollbackPoints };
          delete rollbackPoints[entityId];
          return { rollbackPoints };
        }),
    }),
    {
      name: 'forge-audit-storage',
    }
  )
);
