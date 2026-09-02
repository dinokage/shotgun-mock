import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PublishLog } from "@/data/mockData";

/**
 * Publish pipeline log entries shown on the Publishing Center page. No mock
 * seed -- starts empty, populated only by real "Confirm Publish" actions.
 */
interface PublishingState {
  logs: PublishLog[];
  addPublishLog: (log: PublishLog) => void;
}

export const usePublishingStore = create<PublishingState>()(
  persist(
    (set) => ({
      logs: [],
      addPublishLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
    }),
    {
      name: "forge-publishing",
      // Bumped from the implicit default (0): this store used to seed from
      // the mock PUBLISH_LOGS fixture (40 fabricated entries), and any
      // browser that already persisted that would keep showing it forever
      // otherwise -- a version bump forces a fresh, genuinely empty start.
      version: 1,
    },
  ),
);
