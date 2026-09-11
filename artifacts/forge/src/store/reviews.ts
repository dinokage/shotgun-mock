import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Review, Version } from "@/data/mockData";

/**
 * The single mock "version" the client review portal keys its annotations to.
 * This is a stand-in for a real per-shot/per-version review-session id; the
 * internal player already uses the task's real Version row instead.
 */
export const PRESENTED_VERSION_ID = "seq-020-sh-040-v003";

interface ReviewState {
  reviews: Review[];
  versions: Version[];
  // Mirrors useUserStore/useTasksStore/etc's setX() pattern -- store/auth.ts's
  // fetchMe() calls these on every login and every 10s poll so real
  // versions/reviews created after the app first loaded actually show up
  // (previously this store only ever read the pre-login mock snapshot,
  // frozen for the whole session in every consumer: shot-detail.tsx,
  // analytics.tsx, home.tsx, Sidebar.tsx, and 3 project-detail tabs).
  setReviews: (reviews: Review[]) => void;
  setVersions: (versions: Version[]) => void;
  addReview: (review: Omit<Review, "id" | "createdAt" | "updatedAt">) => void;
  addVersion: (version: Omit<Version, "id" | "createdAt">) => void;

  /**
   * entityId (shot/asset id) -> id of the version a Rollback action made
   * current. Absent entries fall back to whatever the entity's own record
   * says its current version is — this only tracks explicit overrides, so a
   * Rollback is a real, persisted state change rather than a toast that
   * leaves nothing behind.
   */
  currentVersionOverrides: Record<string, string>;
  /** Roll a shot/asset back to a specific past version, making it current. */
  rollbackToVersion: (entityId: string, versionId: string) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      reviews: [],
      versions: [],
      setReviews: (reviews) => set({ reviews }),
      setVersions: (versions) => set({ versions }),
      addReview: (review) =>
        set((state) => ({
          reviews: [
            {
              ...review,
              id: `rev-${Date.now()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...state.reviews,
          ],
        })),
      addVersion: (version) =>
        set((state) => ({
          versions: [
            {
              ...version,
              id: `ver-${Date.now()}`,
              createdAt: new Date().toISOString(),
            },
            ...state.versions,
          ],
        })),

      currentVersionOverrides: {},
      rollbackToVersion: (entityId, versionId) =>
        set((state) => ({
          currentVersionOverrides: {
            ...state.currentVersionOverrides,
            [entityId]: versionId,
          },
        })),
    }),
    {
      name: "forge-review-storage",
      // v4 discards whatever was persisted before it outright: the store's
      // default seed used to be mockData.ts's generated REVIEWS/VERSIONS
      // arrays, so any pre-v4 browser could still be holding that fake data
      // in localStorage. addReview/addVersion/rollbackToVersion have no real
      // callers anywhere in the app (real reviews/versions are written
      // through the backend and re-fetched via setReviews/setVersions on
      // login and the 10s poll), so there is nothing genuine to lose.
      version: 4,
      migrate: () => ({ reviews: [], versions: [], currentVersionOverrides: {} }),
    },
  ),
);
