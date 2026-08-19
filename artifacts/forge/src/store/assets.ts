import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ASSETS, Asset } from '@/data/mockData';

interface AssetState {
  assets: Asset[];
  setAssets: (assets: Asset[]) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set) => ({
      assets: ASSETS,
      setAssets: (assets) => set({ assets }),
      updateAsset: (id, updates) =>
        set((state) => ({
          assets: state.assets.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),
    }),
    {
      name: 'forge-asset-storage',
    }
  )
);
