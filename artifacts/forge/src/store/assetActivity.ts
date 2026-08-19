import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A record of the last time someone hit "Open in DCC" for an asset. There's
 * no real desktop integration to launch a DCC app from a browser, so this is
 * the honest trace that action leaves: a real, persisted "last opened" state
 * visible on the asset page, rather than a toast that vanishes and changes
 * nothing.
 */
export interface DccOpenRecord {
  app: string;
  userName: string;
  timestamp: string;
}

/**
 * A record of a manual "Publish" action taken on an asset from the asset
 * detail page. The actual `publishStatus` field on the Asset lives in
 * useAssetStore (store/assets.ts) — that's the single shared source of truth
 * other pages (e.g. the project Assets tab) also read/write, so publishing
 * updates it there via `updateAsset`. This store only holds the "who/when"
 * attribution trace, which isn't part of the Asset schema.
 */
export interface AssetPublishRecord {
  userName: string;
  timestamp: string;
}

interface AssetActivityState {
  /** assetId -> most recent DCC launch. */
  lastOpenedInDCC: Record<string, DccOpenRecord>;
  recordDccOpen: (assetId: string, record: DccOpenRecord) => void;
  /** assetId -> most recent manual publish action. */
  publishOverrides: Record<string, AssetPublishRecord>;
  publishAsset: (assetId: string, record: AssetPublishRecord) => void;
}

export const useAssetActivityStore = create<AssetActivityState>()(
  persist(
    (set) => ({
      lastOpenedInDCC: {},
      recordDccOpen: (assetId, record) =>
        set((state) => ({
          lastOpenedInDCC: { ...state.lastOpenedInDCC, [assetId]: record },
        })),
      publishOverrides: {},
      publishAsset: (assetId, record) =>
        set((state) => ({
          publishOverrides: { ...state.publishOverrides, [assetId]: record },
        })),
    }),
    {
      name: 'forge-asset-activity',
    }
  )
);
