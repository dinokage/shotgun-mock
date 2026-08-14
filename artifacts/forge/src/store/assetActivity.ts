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

interface AssetActivityState {
  /** assetId -> most recent DCC launch. */
  lastOpenedInDCC: Record<string, DccOpenRecord>;
  recordDccOpen: (assetId: string, record: DccOpenRecord) => void;
}

export const useAssetActivityStore = create<AssetActivityState>()(
  persist(
    (set) => ({
      lastOpenedInDCC: {},
      recordDccOpen: (assetId, record) =>
        set((state) => ({
          lastOpenedInDCC: { ...state.lastOpenedInDCC, [assetId]: record },
        })),
    }),
    {
      name: 'forge-asset-activity',
    }
  )
);
