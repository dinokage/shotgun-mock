import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AUDIT_EVENTS } from '@/data/mockData';
import { useAssetStore } from './assets';
import { useShotStore } from './shots';

type AuditEntityType = 'asset' | 'shot';

/**
 * Walks every audit event for this entity newer than `timestamp` and builds
 * a field patch that restores the entity to its state right before the
 * earliest of those events happened. Each event's changedFields values are
 * "before → after" strings; iterating newest-first and letting each field
 * keep getting overwritten means the last write — from the oldest
 * qualifying event — is the correct pre-rollback value.
 */
function computeRollbackPatch(entityId: string, timestamp: string): Record<string, string> {
  const laterEvents = AUDIT_EVENTS.filter((e) => e.entityId === entityId && e.timestamp > timestamp).sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : -1
  );

  const patch: Record<string, string> = {};
  for (const event of laterEvents) {
    for (const [field, change] of Object.entries(event.changedFields)) {
      const [before] = change.split('→').map((s) => s.trim());
      patch[field] = before;
    }
  }
  return patch;
}

function applyPatch(entityType: AuditEntityType, entityId: string, patch: Record<string, string>) {
  if (Object.keys(patch).length === 0) return;
  if (entityType === 'asset') {
    useAssetStore.getState().updateAsset(entityId, patch as any);
  } else {
    useShotStore.getState().updateShot(entityId, patch as any);
  }
}

function currentFieldValues(entityType: AuditEntityType, entityId: string, fields: string[]): Record<string, string> {
  const entity =
    entityType === 'asset'
      ? useAssetStore.getState().assets.find((a) => a.id === entityId)
      : useShotStore.getState().shots.find((s) => s.id === entityId);
  if (!entity) return {};
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field] = String((entity as any)[field] ?? '');
  }
  return values;
}

/**
 * Records, per entity, the audit-log timestamp a user last rolled back to —
 * and now actually mutates the real Asset/Shot store to match, instead of
 * only striking through later events in the timeline UI. `entitySnapshots`
 * holds the real field values immediately before the *first* rollback in a
 * chain was applied, so "Restore latest" can put back exactly what was
 * there rather than guessing — see rollbackEntity for why it must stay
 * anchored to that first snapshot even across repeated rollbacks.
 */
interface AuditState {
  rollbackPoints: Record<string, string>;
  entitySnapshots: Record<string, Record<string, string>>;
  rollbackEntity: (entityId: string, entityType: AuditEntityType, timestamp: string) => void;
  clearRollback: (entityId: string, entityType: AuditEntityType) => void;
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      rollbackPoints: {},
      entitySnapshots: {},

      rollbackEntity: (entityId, entityType, timestamp) => {
        // If this entity is already mid-rollback, its live fields hold an
        // *intermediate* rolled-back state, not the true latest one — take
        // fresh currentFieldValues() here without restoring first and
        // they'd get baked into entitySnapshots below, permanently losing
        // the real latest value and leaving "Restore latest" only able to
        // undo back to this intermediate point. So put the true latest
        // values back first, then compute this rollback's before-values
        // and snapshot from that clean baseline.
        const existingSnapshot = get().entitySnapshots[entityId];
        if (existingSnapshot) {
          applyPatch(entityType, entityId, existingSnapshot);
        }

        const patch = computeRollbackPatch(entityId, timestamp);
        const freshValues = currentFieldValues(entityType, entityId, Object.keys(patch));
        // Keep any previously-snapshotted fields the new patch doesn't
        // touch, and refresh the rest from the just-restored true state.
        const snapshot = { ...existingSnapshot, ...freshValues };

        applyPatch(entityType, entityId, patch);

        set((state) => ({
          rollbackPoints: { ...state.rollbackPoints, [entityId]: timestamp },
          entitySnapshots: { ...state.entitySnapshots, [entityId]: snapshot },
        }));
      },

      clearRollback: (entityId, entityType) => {
        const snapshot = get().entitySnapshots[entityId];
        if (snapshot) {
          applyPatch(entityType, entityId, snapshot);
        }
        set((state) => {
          const rollbackPoints = { ...state.rollbackPoints };
          const entitySnapshots = { ...state.entitySnapshots };
          delete rollbackPoints[entityId];
          delete entitySnapshots[entityId];
          return { rollbackPoints, entitySnapshots };
        });
      },
    }),
    {
      name: 'forge-audit-storage',
    }
  )
);
