import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Shot } from "@/data/mockData";

interface ShotState {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  updateReviewStatus: (id: string, isInternal: boolean, status: string) => void;
}

// Helper to lazily sync mutations to the backend without blocking the UI
const syncBackend = async (id: string, updates: any) => {
  try {
    const { apiFetch } = await import("@/lib/apiClient");
    await apiFetch(`/shots/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.error("Failed to sync shot mutation to backend", err);
  }
};

// A client-access session has no capability that lets it through the
// generic PUT /shots/:id (see that route's own comment -- edit_tasks
// deliberately excludes client sessions), so a client's review decision
// used to silently fail here: the toast said "sent to the studio team"
// while the request 403'd and only this browser's local Zustand state
// ever changed. PUT /shots/:id/client-review is the narrow, client-scoped
// endpoint built for exactly this write.
const syncClientReviewDecision = async (id: string, status: string) => {
  try {
    const { apiFetch } = await import("@/lib/apiClient");
    await apiFetch(`/shots/${id}/client-review`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  } catch (err) {
    console.error("Failed to sync client review decision to backend", err);
  }
};

export const useShotStore = create<ShotState>()(
  persist(
    (set) => ({
      shots: [],
      setShots: (shots) => set({ shots }),
      updateShot: (id, updates) => {
        set((state) => ({
          shots: state.shots.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
          ),
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
        if (isInternal) {
          syncBackend(id, { internalReviewStatus: status });
        } else {
          syncClientReviewDecision(id, status);
        }
      },
    }),
    {
      name: "forge-shot-storage",
      // See assets.ts's identical comment: discards any pre-existing
      // localStorage state seeded from mockData.ts's generated SHOTS array.
      version: 1,
      migrate: () => ({ shots: [] }),
    },
  ),
);
