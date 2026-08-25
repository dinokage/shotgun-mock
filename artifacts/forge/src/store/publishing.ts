import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PublishLog, PUBLISH_LOGS } from "@/data/mockData";

/**
 * Publish pipeline log entries shown on the Publishing Center page. Seeded
 * from the mock PUBLISH_LOGS fixture, but held in real store state so that
 * "Confirm Publish" actually appends a durable entry instead of the fixture
 * being a plain module-level const nothing could ever write to.
 */
interface PublishingState {
  logs: PublishLog[];
  addPublishLog: (log: PublishLog) => void;
}

export const usePublishingStore = create<PublishingState>()(
  persist(
    (set) => ({
      logs: PUBLISH_LOGS,
      addPublishLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
    }),
    {
      name: "forge-publishing",
    },
  ),
);
