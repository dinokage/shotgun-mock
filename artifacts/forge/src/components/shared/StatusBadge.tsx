import { Badge } from "@/components/ui/badge";

// On-track/complete/approved states share one semantic green; at-risk states
// share semantic orange; blocked/rejected states share semantic red. These
// route through the --status-green/orange/red tokens in index.css (already
// theme-aware for light/dark) instead of raw Tailwind colors, so a status
// reads consistently wherever it's shown and follows the app's dark-mode
// contrast pass rather than a hardcoded value that ignores it. Pipeline-stage
// statuses that aren't good/bad/blocked (in-progress, review, client-review)
// keep distinct brand-adjacent hues since "in review" isn't a severity.
const STATUS_STYLES: Record<string, string> = {
  ON_TRACK: "bg-status-green/10 text-status-green border-status-green/20",
  AT_RISK: "bg-status-orange/10 text-status-orange border-status-orange/20",
  BOTTLENECK: "bg-status-red/10 text-status-red border-status-red/20",
  COMPLETE: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  complete: "bg-status-green/10 text-status-green border-status-green/20",
  "in-progress": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bottleneck: "bg-status-red/10 text-status-red border-status-red/20",
  review: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  // Approval-chain statuses (Task['status']) — colors match the established
  // convention in TaskDrawer.tsx's own status pill map, so a task reads the
  // same wherever its status is shown.
  "lead-review": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  approved: "bg-status-green/10 text-status-green border-status-green/20",
  // Shot['status'] client-facing states — colors match the established
  // convention in shots.tsx/tracking.tsx (client-review is kept visually
  // distinct from the internal 'review'/'lead-review' purple).
  "client-review": "bg-violet-500/10 text-violet-500 border-violet-500/20",
  published: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  todo: "bg-muted text-muted-foreground",
  "at-risk": "bg-status-orange/10 text-status-orange border-status-orange/20",
  "not-started": "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground/60",
  // Version review statuses (Version['status']) — colors match the same
  // rejected/pending/changes-requested convention used inline in tracking.tsx.
  pending: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  rejected: "bg-status-red/10 text-status-red border-status-red/20",
  "changes-requested":
    "bg-status-orange/10 text-status-orange border-status-orange/20",
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const style = STATUS_STYLES[status] || "bg-muted text-muted-foreground";
  return (
    <Badge className={`${style} text-[10px] font-semibold ${className}`}>
      {status.replace(/-/g, " ").replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}
