import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/data/mockData";

/**
 * A studio-wide or project-scoped status update, posted by a producer or
 * production manager (gated by the 'broadcast_updates' capability in
 * store/permissions.ts) and visible to internal teams, optionally also the
 * client portal. This is the data layer for the "Mobile Status Broadcast"
 * feature scoped in the 2026-08-19 product review — the natural extension of
 * the existing Daily Standup feed (store/standups.ts) rather than a
 * parallel concept, so it lives alongside that store's conventions.
 */
export interface Broadcast {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  text: string;
  timestamp: string;
  /**
   * 'internal' stays inside the studio (Daily Standup / dashboards).
   * 'internal_and_client' also surfaces on the external client portal
   * (client-review.tsx) for the given projectId — the only bridge this
   * feature has to that external, unauthenticated-by-Forge-login surface.
   */
  audience: "internal" | "internal_and_client";
  /** Required when audience is 'internal_and_client' — scopes which
   *  client-portal project sees it. Null for a studio-wide internal post. */
  projectId: string | null;
  /** Maps to the app's --status-green/orange/red tokens (StatusBadge,
   *  index.css) so severity reads the same way it does everywhere else,
   *  rather than inventing a new color vocabulary for this one feed. */
  severity: "info" | "success" | "warning";
}

interface BroadcastsState {
  broadcasts: Broadcast[];
  addBroadcast: (broadcast: Broadcast) => void;
}

export const useBroadcastsStore = create<BroadcastsState>()(
  persist(
    (set) => ({
      broadcasts: [],
      addBroadcast: (broadcast) =>
        set((state) => ({ broadcasts: [broadcast, ...state.broadcasts] })),
    }),
    {
      name: "forge-broadcasts-storage",
    },
  ),
);
