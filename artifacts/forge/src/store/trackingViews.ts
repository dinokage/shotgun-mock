import { create } from "zustand";
import { persist } from "zustand/middleware";

// Grouping / sorting vocabulary shared with the Tracking Grid page.
export type TrackingGroupKey =
  | "none"
  | "project"
  | "episode"
  | "department"
  | "assignee"
  | "status"
  | "internalReview"
  | "clientReview";

export type TrackingSortKey =
  "hierarchy" | "shot" | "assignee" | "status" | "updated";

export interface TrackingViewFilters {
  search: string;
  projectFilter: string;
  episodeFilter?: string;
  sequenceFilter?: string;
  assigneeFilter?: string;
  positionFilter?: string;
  departmentFilter?: string;
  groupBy1: TrackingGroupKey;
  groupBy2: TrackingGroupKey;
  sortBy: TrackingSortKey;
  view: "list" | "card";
}

export interface SavedTrackingView {
  id: string;
  name: string;
  createdAt: string;
  filters: TrackingViewFilters;
}

interface TrackingViewsState {
  views: SavedTrackingView[];
  activeViewId: string | null;
  addView: (name: string, filters: TrackingViewFilters) => void;
  removeView: (id: string) => void;
  setActiveViewId: (id: string | null) => void;
}

export const useTrackingViewsStore = create<TrackingViewsState>()(
  persist(
    (set) => ({
      views: [],
      activeViewId: null,
      addView: (name, filters) =>
        set((state) => {
          const id = `tview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return {
            views: [
              ...state.views,
              { id, name, createdAt: new Date().toISOString(), filters },
            ],
            activeViewId: id,
          };
        }),
      removeView: (id) =>
        set((state) => ({
          views: state.views.filter((v) => v.id !== id),
          activeViewId: state.activeViewId === id ? null : state.activeViewId,
        })),
      setActiveViewId: (id) => set({ activeViewId: id }),
    }),
    {
      name: "forge-tracking-views",
    },
  ),
);
