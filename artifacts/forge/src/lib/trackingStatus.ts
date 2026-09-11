import type { TaskStatus } from "@/data/mockData";

// The imported tracksheet carries the studio's own status vocabulary
// ("Client_App", "WFF", "TK_02_APP", "Client_Tk02_Rtk", ...). None of it
// matches the pipeline stages every board, dashboard, queue and rollup in
// this app filters on, which is why those surfaces read empty against real
// data. This maps a tracksheet code onto the stage it means, so the original
// string stays the source of truth in the DB and on the card while the app
// can still reason about where the work actually sits.
//
// Matching is by pattern, not a fixed lookup, because take numbers grow
// (TK_01 -> TK_05) and new client/retake permutations keep appearing.

/** The studio's code, unchanged, is what gets displayed; this is what it means. */
export function normalizeTaskStatus(raw: string | null | undefined): TaskStatus {
  if (!raw) return "not-started";
  const s = raw.trim().toLowerCase();

  // Already one of the app's own stages.
  const canonical: TaskStatus[] = [
    "not-started",
    "todo",
    "in-progress",
    "bottleneck",
    "review",
    "lead-review",
    "pm-review",
    "approved",
    "complete",
    "cancelled",
  ];
  if (canonical.includes(s as TaskStatus)) return s as TaskStatus;

  // "ready" is the tasks table's own column default, written when a row is
  // created without an explicit status — it means untouched, not available.
  if (s === "ready") return "not-started";

  if (s.includes("omit")) return "cancelled";
  if (s.includes("reuse")) return "complete";

  // Blocked on an input that hasn't arrived. WFF is the studio's shorthand
  // for waiting on a file; it sits alongside the spelled-out variants.
  if (s === "wff" || s.startsWith("waiting") || s.includes("need sc file")) {
    return "bottleneck";
  }

  const isRetake = /\brtk\b|retake/.test(s);
  const isApproved = /\bapp\b|approved/.test(s);
  const isClient = s.startsWith("client");

  // "NO Rtk" is a clearance, not a retake — check before the retake branch.
  if (/^no[\s_]*rtk/.test(s)) return "complete";
  // A finished retake goes back up the chain for checking.
  if (/rtk[\s_]*done/.test(s)) return "review";
  // Any other retake is work to redo.
  if (isRetake) return "in-progress";

  // Client sign-off is the final gate; an internal take approval is not.
  if (isApproved) return isClient ? "complete" : "approved";

  // A bare take number (TK03) is that take in progress, as is anything
  // carrying a production note ("merge with 2a", "Layout file").
  return "in-progress";
}

/** True when the status string is the studio's own code rather than an app stage. */
export function isTracksheetStatus(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.trim().toLowerCase();
  const canonical = [
    "not-started",
    "todo",
    "in-progress",
    "bottleneck",
    "review",
    "lead-review",
    "pm-review",
    "approved",
    "complete",
    "cancelled",
    "other",
    "ready",
  ];
  return !canonical.includes(s);
}
