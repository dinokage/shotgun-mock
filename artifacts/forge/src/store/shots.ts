import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SHOTS, Shot } from '@/data/mockData';

interface ShotState {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  updateReviewStatus: (id: string, isInternal: boolean, status: string) => void;
}

// Helper to lazily sync mutations to the backend without blocking the UI
const syncBackend = async (id: string, updates: any) => {
  try {
    const { apiFetch } = await import('@/lib/apiClient');
    await apiFetch(`/shots/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  } catch (err) {
    console.error('Failed to sync shot mutation to backend', err);
  }
};

export const useShotStore = create<ShotState>()(
  persist(
    (set) => ({
      shots: SHOTS,
      setShots: (shots) => set({ shots }),
      updateShot: (id, updates) => {
        set((state) => ({
          shots: state.shots.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }));
        syncBackend(id, updates);
      },
      updateReviewStatus: (id, isInternal, status) => {
        set((state) => ({
          shots: state.shots.map((s) => {
            if (s.id === id) {
              return isInternal
                ? { ...s, internalReviewStatus: status as any }
                : { ...s, clientReviewStatus: status as any };
            }
            return s;
          }),
        }));
        const updatePayload = isInternal ? { internalReviewStatus: status } : { clientReviewStatus: status };
        syncBackend(id, updatePayload);
      },
    }),
    {
      name: 'forge-shot-storage',
    }
  )
);
