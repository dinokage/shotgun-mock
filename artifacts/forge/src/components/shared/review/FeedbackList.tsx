import { Mic, MessageSquareOff, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { USERS } from "@/data/mockData";
import { useReviewStore, type ReviewComment } from "@/store/reviews";
import { cn } from "@/lib/utils";

type WorkflowStatus = "wip" | "lead-review" | "manager-review" | "approved";

const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  wip: "Work in progress",
  "lead-review": "Awaiting Lead review",
  "manager-review": "Awaiting Manager review",
  approved: "Approved",
};

interface FeedbackListProps {
  /** Shot/version label shown in the header, e.g. "SEQ_020_SH_040 v003". */
  versionLabel: string;
  workflowStatus: WorkflowStatus;
  /**
   * Jump back to the full Player at a specific frame. Optional — omitted
   * (e.g. while locked to someone else's Presentation Mode session) simply
   * renders the frame as a plain label instead of a button. This component
   * never touches playback/canvas state itself; the parent page owns that.
   */
  onJumpToFrame?: (frame: number) => void;
  className?: string;
}

/**
 * Lightweight, read-first rendering of the same comment stream the full
 * Player's "Comments" tab shows (`useReviewStore().comments`) — no scrubber,
 * canvas, or waveform mounted. Built for anyone (most often an artist)
 * who just wants to read feedback on their submission, including on a small
 * screen where the full annotation tool doesn't fit.
 */
export function FeedbackList({
  versionLabel,
  workflowStatus,
  onJumpToFrame,
  className,
}: FeedbackListProps) {
  // Same store the full Player reads from — this is a second render of the
  // existing data, not a separate/duplicated source of truth.
  const comments = useReviewStore((s) => s.comments);

  return (
    <div className={cn("flex-1 overflow-y-auto bg-background", className)}>
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1 className="text-base sm:text-lg font-medium truncate min-w-0">
            {versionLabel}
          </h1>
          <span
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-full border shrink-0",
              workflowStatus === "approved"
                ? "bg-accent-scope/10 text-accent-scope border-accent-scope/20"
                : "bg-accent-tally/10 text-accent-tally border-accent-tally/20",
            )}
          >
            {WORKFLOW_STATUS_LABEL[workflowStatus]}
          </span>
        </div>

        {comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground text-center py-16">
            <MessageSquareOff className="w-6 h-6 opacity-50" />
            No feedback yet on this version.
          </div>
        ) : (
          <ul className="space-y-4">
            {comments.map((comment) => (
              <FeedbackListItem
                key={comment.id}
                comment={comment}
                onJumpToFrame={onJumpToFrame}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FeedbackListItem({
  comment,
  onJumpToFrame,
}: {
  comment: ReviewComment;
  onJumpToFrame?: (frame: number) => void;
}) {
  const user = comment.fromClient ? null : USERS[comment.userIndex];
  const displayName = comment.fromClient
    ? comment.fromClient.authorName
    : (user?.name ?? "Unknown");

  return (
    <li className="flex gap-3">
      <Avatar className="w-10 h-10 shrink-0">
        {user && <AvatarImage src={user.avatar} />}
        <AvatarFallback
          className={
            comment.fromClient
              ? "bg-accent-scope/15 text-accent-scope"
              : undefined
          }
        >
          {displayName.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 rounded-lg border border-border bg-card p-3">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="font-medium text-sm">{displayName}</span>
          {comment.fromClient && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-scope bg-accent-scope/10 px-1.5 py-0.5 rounded">
              Client
            </span>
          )}
          <span className="timecode text-xs text-muted-foreground ml-auto">
            F{String(comment.frame).padStart(3, "0")}
          </span>
        </div>

        {comment.text && (
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
            {comment.text}
          </p>
        )}

        {comment.audioUrl && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Mic className="w-3.5 h-3.5 shrink-0" />
            {/* Native controls, not the full canvas-adjacent VoiceNotePlayer —
                Feedback mode intentionally mounts no waveform. Playback can
                fail silently here if the recording's blob: URL is dead (a
                different browser session) — that's an existing limitation of
                session-scoped blob URLs, not something this view can fix. */}
            <audio
              controls
              preload="metadata"
              src={comment.audioUrl}
              className="h-8 max-w-full flex-1"
            />
          </div>
        )}

        {onJumpToFrame && (
          <button
            type="button"
            className="touch-target inline-flex items-center gap-1.5 mt-2 px-3 text-xs font-medium rounded-md border border-accent-tally/30 text-accent-tally hover-elevate active-elevate-2"
            onClick={() => onJumpToFrame(comment.frame)}
            aria-label={`Open Player at frame ${comment.frame}`}
          >
            <Play className="w-3.5 h-3.5" /> Open in Player
          </button>
        )}
      </div>
    </li>
  );
}
