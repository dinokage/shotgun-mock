import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SHOTS, Shot } from '@/data/mockData';

interface ShotState {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  updateReviewStatus: (id: string, isInternal: boolean, status: string) => void;
}

export const useShotStore = create<ShotState>()(
  persist(
    (set) => ({
      shots: SHOTS,
      setShots: (shots) => set({ shots }),
      updateShot: (id, updates) =>
        set((state) => ({
          shots: state.shots.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),
      updateReviewStatus: (id, isInternal, status) =>
        set((state) => ({
          shots: state.shots.map((s) => {
            if (s.id === id) {
              return isInternal
                ? { ...s, internalReviewStatus: status as any }
                : { ...s, clientReviewStatus: status as any };
            }
            return s;
          }),
        })),
    }),
    {
      name: 'forge-shot-storage',
    }
  )
);
