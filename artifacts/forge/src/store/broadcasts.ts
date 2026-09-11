import type { Role } from "@/data/mockData";

/**
 * A studio-wide or project-scoped status update, posted by a producer or
 * production manager (gated by the 'broadcast_updates' capability) and
 * visible to internal teams, optionally also the client portal.
 *
 * This is the shape the broadcast UI renders. The rows themselves live in
 * the `broadcasts` table behind /api/broadcasts (hooks/useBroadcasts.ts) —
 * a per-browser localStorage copy meant a studio-wide announcement reached
 * nobody but the person who posted it, and never reached the client portal
 * at all.
 */
export interface Broadcast {
  id: string;
  authorId: string | null;
  authorName: string;
  /** Null when the author's account is gone, or when the viewer is a client
   *  (the portal is shown these as coming from the studio, not a person). */
  authorRole: Role | null;
  text: string;
  timestamp: string;
  /**
   * 'internal' stays inside the studio (Daily Standup / dashboards).
   * 'internal_and_client' also surfaces on the external client portal
   * (client-review.tsx) for the given projectId — the only bridge this
   * feature has to that external surface.
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
