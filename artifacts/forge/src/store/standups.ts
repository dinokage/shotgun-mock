import { create } from "zustand";
import { persist } from "zustand/middleware";

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

  /**
   * Dailies Playlist Builder queue, stored as an ordered list of task IDs
   * (not full task snapshots) so it always reflects the live task data and
   * survives reload/navigation like the rest of this store.
   */
  playlist: string[];
  addToPlaylist: (taskId: string) => void;
  removeFromPlaylist: (taskId: string) => void;
  /** Replaces the full ordering, used after a drag-to-reorder. */
  setPlaylist: (taskIds: string[]) => void;
  clearPlaylist: () => void;

  /**
   * Per-feed-item approvals, keyed by feed item id, holding the userIds who
   * approved it. Real, persisted state backing the "X Approvals" toggle on
   * feed cards (previously local component state on hardcoded fake data).
   */
  feedApprovals: Record<string, string[]>;
  toggleFeedApproval: (feedItemId: string, userId: string) => void;
}

export const useStandupsStore = create<StandupsState>()(
  persist(
    (set) => ({
      updates: [],
      addUpdate: (update) =>
        set((state) => ({ updates: [update, ...state.updates] })),

      playlist: [],
      addToPlaylist: (taskId) =>
        set((state) =>
          state.playlist.includes(taskId)
            ? state
            : { playlist: [...state.playlist, taskId] },
        ),
      removeFromPlaylist: (taskId) =>
        set((state) => ({
          playlist: state.playlist.filter((id) => id !== taskId),
        })),
      setPlaylist: (taskIds) => set({ playlist: taskIds }),
      clearPlaylist: () => set({ playlist: [] }),

      feedApprovals: {},
      toggleFeedApproval: (feedItemId, userId) =>
        set((state) => {
          const current = state.feedApprovals[feedItemId] ?? [];
          const next = current.includes(userId)
            ? current.filter((id) => id !== userId)
            : [...current, userId];
          return {
            feedApprovals: { ...state.feedApprovals, [feedItemId]: next },
          };
        }),
    }),
    {
      name: "forge-standup-storage",
    },
  ),
);
