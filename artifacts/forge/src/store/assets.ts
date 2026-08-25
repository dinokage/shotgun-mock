import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ASSETS, Asset } from '@/data/mockData';

interface AssetState {
  assets: Asset[];
  setAssets: (assets: Asset[]) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
}

// Helper to lazily sync mutations to the backend without blocking the UI
const syncBackend = async (id: string, updates: any) => {
  try {
    const { apiFetch } = await import('@/lib/apiClient');
    await apiFetch(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  } catch (err) {
    console.error('Failed to sync asset mutation to backend', err);
  }
};

export const useAssetStore = create<AssetState>()(
  persist(
    (set) => ({
      assets: ASSETS,
      setAssets: (assets) => set({ assets }),
      updateAsset: (id, updates) => {
        set((state) => ({
          assets: state.assets.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        }));
        syncBackend(id, updates);
      },
    }),
    {
      name: 'forge-asset-storage',
    }
  )
);
