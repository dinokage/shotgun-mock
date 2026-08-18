import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A single daily-standup update posted by a team member from the "My
 * Updates & Feed" tab. Persisted so the Team Updates Feed reflects posts
 * across reloads/navigation, following the same persist pattern as
 * src/store/tasks.ts and src/store/trackingViews.ts.
 */
export interface StandupUpdate {
  id: string;
  userId: string;
  taskId: string | null;
  text: string;
  hours: number;
  timestamp: string;
}

interface StandupsState {
  updates: StandupUpdate[];
  addUpdate: (update: StandupUpdate) => void;
}

export const useStandupsStore = create<StandupsState>()(
  persist(
    (set) => ({
      updates: [],
      addUpdate: (update) =>
        set((state) => ({ updates: [update, ...state.updates] })),
    }),
    {
      name: 'forge-standup-storage',
    }
  )
);
