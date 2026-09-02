import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  USERS,
  SHOTS,
  REVIEWED_TASK_ID,
  type ApprovalEvent,
} from "@/data/mockData";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  MousePointer2,
  CheckCircle2,
  MessageSquare,
  XCircle,
  ChevronLeft,
  Circle,
  Upload,
  Camera,
  Film,
  SplitSquareHorizontal,
  Layers,
  Mic,
  MicOff,
  Square as SquareIcon,
  Package,
  Columns2,
  GitCompareArrows,
  Link2,
  AlertTriangle,
  Send,
  Inbox,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useCapability } from "@/hooks/use-capability";
import {
  LEADERSHIP_ROLES,
  DEPARTMENT_LEADERSHIP_ROLES,
} from "@/store/permissions";
import { Link, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { cn, copyToClipboard } from "@/lib/utils";
import { cut } from "@/lib/motion";
import { hashString } from "@/lib/seededMock";
import { getPlaceholderThumbnail } from "@/lib/placeholderArt";
import { useAuthStore } from "@/store/auth";
import { useTasksStore } from "@/store/tasks";
import {
  useReviewStore,
  PRESENTED_VERSION_ID,
  type ReviewComment,
} from "@/store/reviews";
import {
  useNotificationStore,
  type NotificationCategory,
} from "@/store/notifications";
import {
  AnnotationToolbar,
  AnnotationCanvas,
  PlaybackControls,
  FrameScrubber,
  PresentationToggle,
  PresentationLockBanner,
  GhostingToggle,
  FeedbackList,
  type AnnotationTool,
  type Annotation,
  type DraggingElement,
  type SetAnnotations,
} from "@/components/shared/review";
import {
  useAnnotations,
  useCreateAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
} from "@/hooks/useReviews";

interface MediaClip {
  id: string;
  src: string;
  trackIndex: number;
  startFrame: number;
  endFrame: number;
  opacity: number;
  blendMode: "normal" | "multiply" | "screen" | "overlay" | "difference";
  name: string;
  x: number;
  y: number;
  scale: number;
}

const COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#d946ef",
  "#ffffff",
];

const APPROVAL_ACTION_LABEL: Record<ApprovalEvent["action"], string> = {
  "submitted-for-lead-review": "submitted for Lead review",
  approved: "approved",
  "changes-requested": "requested changes",
  rejected: "rejected",
  published: "approved & published",
};

function ApprovalActionIcon({ action }: { action: ApprovalEvent["action"] }) {
  switch (action) {
    case "approved":
    case "published":
      return <CheckCircle2 className="w-3.5 h-3.5 text-[#1E7A34] shrink-0" />;
    case "changes-requested":
      return <MessageSquare className="w-3.5 h-3.5 text-[#B5651D] shrink-0" />;
    case "rejected":
      return <XCircle className="w-3.5 h-3.5 text-[#A03030] shrink-0" />;
    default:
      return <Upload className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
}

/**
 * Plays back a recorded voice-note comment and draws its waveform from the
 * real amplitude samples captured during recording (see `toggleRecording`
 * below) — not a decorative placeholder. `audioUrl` is a `blob:` object URL,
 * so it only survives for this browser tab's session; if the page was
 * reloaded (or the note is from a different session) the URL is dead and the
 * `<audio>` element fires `onError` — handled below rather than left to crash.
 */
function VoiceNotePlayer({ comment }: { comment: ReviewComment }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  if (!comment.audioUrl) return null;

  if (unavailable) {
    return (
      <div className="mt-2 bg-muted/50 rounded-full h-8 flex items-center px-3 gap-2 w-56 text-xs text-muted-foreground">
        <MicOff className="w-3.5 h-3.5 shrink-0" />
        Voice note unavailable (session ended)
      </div>
    );
  }

  const waveform =
    comment.waveform && comment.waveform.length > 0
      ? comment.waveform
      : Array.from({ length: 18 }, () => 0.35);
  const durationLabel =
    duration && isFinite(duration)
      ? `0:${String(Math.round(duration)).padStart(2, "0")}`
      : "--:--";

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.currentTime =
        audio.ended || audio.currentTime >= audio.duration
          ? 0
          : audio.currentTime;
      audio.play().catch(() => setUnavailable(true));
    }
  };

  return (
    <div className="mt-2 bg-primary/10 rounded-full h-8 flex items-center px-3 gap-2 w-48">
      <audio
        ref={audioRef}
        src={comment.audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const d = e.currentTarget.duration;
          if (d && isFinite(d) && d > 0)
            setProgress(e.currentTarget.currentTime / d);
        }}
        onError={() => setUnavailable(true)}
        className="hidden"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-full hover:bg-primary/20 shrink-0 text-primary"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? (
          <Pause className="w-3 h-3" />
        ) : (
          <Play className="w-3 h-3" />
        )}
      </Button>
      <div className="flex-1 flex items-center gap-0.5 h-3">
        {waveform.map((v, i) => (
          <div
            key={i}
            className={cn(
              "w-1 rounded-full transition-colors",
              i / waveform.length <= progress ? "bg-primary" : "bg-primary/40",
            )}
            style={{ height: `${Math.max(15, v * 100)}%` }}
          />
        ))}
      </div>
      <span className="text-[10px] text-primary font-mono shrink-0">
        {durationLabel}
      </span>
    </div>
  );
}

export default function Review() {
  const { currentUser } = useAuthStore();
  const isManager = currentUser && LEADERSHIP_ROLES.includes(currentUser.role);

  const isLead =
    currentUser && DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role);
  const isProd =
    currentUser &&
    ["production_head", "producer"].includes(currentUser.role);
  const canPresent = Boolean(isLead || isProd);
  // Submitting/approving a review is a specific, editable capability (Settings >
  // Roles & Permissions) rather than a hardcoded role list — isLead/isProd above
  // stay hardcoded only for the things that don't have a matching capability id
  // (presenting, sharing the client link).
  const canSubmitReview = useCapability("submit_reviews");
  const canApproveReview = useCapability("approve_reviews");
  // Index into USERS for the logged-in user, used to attribute anything this
  // page writes into the shared comment stream (comments, stamps) to whoever
  // is actually signed in — not a hardcoded seed user. -1 (renders as
  // "Unknown") if somehow nobody is logged in.
  const currentUserIndex = currentUser
    ? USERS.findIndex((u) => u.id === currentUser.id)
    : -1;

  // Presentation Mode: a Lead/Producer can broadcast their playhead to every
  // other tab open to this version (this internal page, and the client
  // portal). Sync is real but transport-limited to this mock's zustand
  // `persist` + storage-event bridge (see src/store/reviews.ts) — it only
  // reaches other tabs/windows in the same browser, not another reviewer's
  // own machine, so copy shown to the user must say "tabs", not "viewers".
  const presentation = useReviewStore((s) => s.presentation);
  const startPresentation = useReviewStore((s) => s.startPresentation);
  const stopPresentation = useReviewStore((s) => s.stopPresentation);
  const setPresenterFrame = useReviewStore((s) => s.setPresenterFrame);
  const isPresenting =
    presentation.isActive && presentation.presenterId === currentUser?.id;
  const isLockedViewer =
    presentation.isActive &&
    presentation.versionId === PRESENTED_VERSION_ID &&
    presentation.presenterId !== currentUser?.id;

  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [videoClips, setVideoClips] = useState<MediaClip[]>([
    {
      id: "base-v1",
      src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
      trackIndex: 0,
      startFrame: 1,
      endFrame: 240,
      opacity: 100,
      blendMode: "normal",
      name: "Main Sequence",
      x: 0,
      y: 0,
      scale: 1,
    },
  ]);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [viewerMode, setViewerMode] = useState(false);
  // Presentation-layer-only mode switch: "Player" is the full annotation tool
  // below (completely unchanged), "Feedback" is a lightweight read view of
  // the same comment stream for anyone who just wants to read notes on a
  // submission — including on a small screen where the full tool doesn't
  // fit. Doesn't affect routing, RBAC, or any store logic.
  // TaskDrawer's "View Review Feedback" link opens straight into Feedback
  // mode via ?mode=feedback, instead of always landing on the heavier Player.
  const searchParams = useSearch();
  const [pageMode, setPageMode] = useState<"player" | "feedback">(
    new URLSearchParams(searchParams).get("mode") === "feedback"
      ? "feedback"
      : "player",
  );
  // Read-only Reviewer mode and being a locked Presentation Mode viewer both
  // mean "you may look but not touch". `AnnotationCanvas` already enforces
  // this for its own drawing surface via its `readOnly`/`tool` props, but the
  // clip-drag handles below, the timeline resize handles, and the Properties
  // panel are separate mutation paths on this page and need the same guard —
  // otherwise "Read-only Reviewer" isn't actually read-only.
  const canEdit = !viewerMode && !isLockedViewer;
  // Comments (including voice notes) live in the review store so they persist
  // across reloads/tabs like presentation state does, rather than being lost
  // local-only state.
  const comments = useReviewStore((s) => s.comments);
  const addComment = useReviewStore((s) => s.addComment);
  const [commentDraft, setCommentDraft] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const waveformSamplesRef = useRef<number[]>([]);
  const waveformIntervalRef = useRef<number | null>(null);
  const [color, setColor] = useState("#ef4444");
  // Annotations are persisted server-side, keyed to the version currently
  // being reviewed (PRESENTED_VERSION_ID — the same "current version" id
  // already used above for Presentation Mode syncing).
  const { data: annotations = [] } = useAnnotations(PRESENTED_VERSION_ID);
  const createAnnotation = useCreateAnnotation(PRESENTED_VERSION_ID);
  const updateAnnotation = useUpdateAnnotation(PRESENTED_VERSION_ID);
  const deleteAnnotation = useDeleteAnnotation(PRESENTED_VERSION_ID);
  // Bridges the shared AnnotationCanvas's raw dispatch-style API (and this
  // page's own resize/drag handlers, which were all written against a local
  // useState<Annotation[]>) onto the server-backed list above. Ids added by
  // the updater become createAnnotation.mutate calls; ids dropped become
  // deleteAnnotation.mutate calls; ids present in both but with changed
  // fields (resize handles, dragging, the Properties panel's text/color/
  // frame-range fields) become updateAnnotation.mutate calls against
  // PUT /reviews/annotations/:id.
  const applyAnnotationsUpdate: SetAnnotations = (update) => {
    const prevList = annotations;
    const nextList =
      typeof update === "function"
        ? (update as (prev: Annotation[]) => Annotation[])(prevList)
        : update;
    const prevById = new Map(prevList.map((a) => [a.id, a]));
    const nextIds = new Set(nextList.map((a) => a.id));
    nextList.forEach((a) => {
      const prev = prevById.get(a.id);
      if (!prev) {
        const { id, ...rest } = a;
        createAnnotation.mutate(rest);
      } else if (JSON.stringify(prev) !== JSON.stringify(a)) {
        const { id, ...rest } = a;
        updateAnnotation.mutate({ id, ...rest });
      }
    });
    prevList
      .filter((a) => !nextIds.has(a.id))
      .forEach((a) => deleteAnnotation.mutate(a.id));
  };
  const [resizing, setResizing] = useState<{
    id: string;
    type: "video" | "annotation";
    edge: "start" | "end";
  } | null>(null);
  const [draggingElement, setDraggingElement] =
    useState<DraggingElement | null>(null);

  const [abWipe, setAbWipe] = useState(false);
  const [abWipePosition, setAbWipePosition] = useState(50);
  const [isDraggingWipe, setIsDraggingWipe] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [ghosting, setGhosting] = useState(false);

  // Version Comparison State
  const [compareMode, setCompareMode] = useState<
    "off" | "side-by-side" | "overlay"
  >("off");
  const [compareVersionA, setCompareVersionA] = useState("v003");
  const [compareVersionB, setCompareVersionB] = useState("v001");
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const compareVideoRefA = useRef<HTMLVideoElement>(null);
  const compareVideoRefB = useRef<HTMLVideoElement>(null);

  // Mock version list for the compare dropdown
  const VERSIONS = [
    {
      id: "v001",
      label: "v001 — Initial Layout",
      src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    },
    {
      id: "v002",
      label: "v002 — Lighting Pass",
      src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    },
    {
      id: "v003",
      label: "v003 — Final Comp",
      src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    },
  ];

  // Multi-tier approval chain (Artist -> Lead/Supervisor -> Producer) is real,
  // persisted state on the task backing this version — not local UI state —
  // so it survives reload/navigation and stays in sync with every other view
  // of the same task (Kanban, task drawer, dashboards). ftrack only tracks a
  // single status field per version; this is a genuine multi-step chain with
  // a full audit trail.
  const tasks = useTasksStore((s) => s.tasks);
  const recordApprovalEvent = useTasksStore((s) => s.recordApprovalEvent);
  const reviewedTask = tasks.find((t) => t.id === REVIEWED_TASK_ID);
  const reviewedShot = reviewedTask?.shotId
    ? SHOTS.find((s) => s.id === reviewedTask.shotId)
    : undefined;
  const reviewWorkflowStatus: "wip" | "lead-review" | "approved" =
    reviewedTask?.status === "lead-review" ||
    reviewedTask?.status === "approved"
      ? reviewedTask.status
      : "wip";
  const addNotification = useNotificationStore((s) => s.addNotification);
  const APPROVAL_NOTIFICATION_CATEGORY: Record<
    ApprovalEvent["action"],
    NotificationCategory
  > = {
    "submitted-for-lead-review": "review",
    approved: "approval",
    "changes-requested": "workflow",
    rejected: "workflow",
    published: "publishing",
  };
  const submitApproval = (
    status: "in-progress" | "lead-review" | "approved",
    action: ApprovalEvent["action"],
  ) => {
    if (!currentUser) return;
    recordApprovalEvent(REVIEWED_TASK_ID, status, {
      action,
      byUserId: currentUser.id,
      byUserName: currentUser.name,
      byRole: currentUser.role,
    });
    // A real event in the approval chain — surface it in the shared
    // Notifications feed, not just as a toast that vanishes with this tab.
    const shotLabel = reviewedShot
      ? `${reviewedShot.name} ${reviewedShot.currentVersion}`
      : "this version";
    addNotification({
      title: `${shotLabel} ${APPROVAL_ACTION_LABEL[action]}`,
      description: `${currentUser.name} ${APPROVAL_ACTION_LABEL[action]} on ${shotLabel}.`,
      category: APPROVAL_NOTIFICATION_CATEGORY[action],
      priority: action === "rejected" ? "high" : "medium",
      entityType: "review",
      entityId: REVIEWED_TASK_ID,
      actionUrl: "/review",
    });
  };

  // Client feedback moderation: notes a client leaves in the client portal
  // land in a holding area here rather than the shared comment stream — an
  // internal reviewer has to explicitly "transfer" a note before it becomes
  // visible team-wide.
  const clientNotes = useReviewStore((s) => s.clientNotes);
  const transferClientNote = useReviewStore((s) => s.transferClientNote);
  const pendingClientNotes = clientNotes.filter((n) => !n.transferred);

  const { toast } = useToast();
  const maxFrames = 240;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoCanvasContainerRef = useRef<HTMLDivElement>(null);

  // Mock Remote Cursors
  const [remoteCursors, setRemoteCursors] = useState<
    {
      id: string;
      name: string;
      color: string;
      x: number;
      y: number;
      active: boolean;
    }[]
  >([
    {
      id: "rc1",
      name: "Akira S.",
      color: "#10b981",
      x: 0,
      y: 0,
      active: false,
    },
    { id: "rc2", name: "Jada W.", color: "#8b5cf6", x: 0, y: 0, active: false },
  ]);

  useEffect(() => {
    // Simulate real-time remote cursor movement and collaborative annotation
    const interval = setInterval(() => {
      setRemoteCursors((prev) =>
        prev.map((c) => {
          if (Math.random() > 0.9) {
            return { ...c, active: Math.random() > 0.3 };
          }
          if (!c.active) return c;

          const targetX = c.x + (Math.random() - 0.5) * 150;
          const targetY = c.y + (Math.random() - 0.5) * 150;
          const newX = Math.max(10, Math.min(800, targetX));
          const newY = Math.max(10, Math.min(500, targetY));

          // Occasionally simulate them drawing a box
          if (Math.random() > 0.95 && !isPlaying) {
            applyAnnotationsUpdate((prevAnns) => [
              ...prevAnns,
              {
                id: `remote-${Date.now()}`,
                frame,
                type: "rectangle",
                color: c.color,
                x: newX,
                y: newY,
                w: 50 + Math.random() * 100,
                h: 50 + Math.random() * 100,
                text: "Needs adjustment",
                startFrame: frame,
                endFrame: Math.min(maxFrames, frame + 30),
              },
            ]);
            toast({ description: `${c.name} added an annotation.` });
          }

          return { ...c, x: newX, y: newY };
        }),
      );
    }, 1200);
    return () => clearInterval(interval);
  }, [frame, isPlaying, maxFrames]);

  // Keyboard shortcuts. This is the single global key handler for the page —
  // playback/scrub also used to be bound a second time by a raw
  // window `keydown` listener further down, which double-fired every
  // Space/Arrow press (toggled play twice, stepped the frame twice). That
  // listener has been removed; this is now the only place Space/Arrow are
  // bound.
  //
  // Tool-switching and delete are additionally gated on `viewerMode`
  // ("Read-only Reviewer") so a read-only reviewer can't draw or delete
  // annotations via hotkeys even though the toolbar itself is hidden — the
  // drawing surface below is also forced to the 'select' tool and marked
  // `readOnly` for the same reason, in case `tool` was already something
  // else before Read-only mode was switched on.
  useHotkeys(
    {
      Space: () => !isLockedViewer && setIsPlaying((p) => !p),
      ArrowLeft: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame((f) => Math.max(1, f - 1));
      },
      ArrowRight: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame((f) => Math.min(maxFrames, f + 1));
      },
      j: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame((f) => Math.max(1, f - 5));
      },
      k: () => !isLockedViewer && setIsPlaying((p) => !p),
      l: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame((f) => Math.min(maxFrames, f + 5));
      },
      "[": () => {
        /* trim in point placeholder */
      },
      "]": () => {
        /* trim out point placeholder */
      },
      Escape: () => {
        setSelectedAnnotationId(null);
        setTool("select");
      },
      Delete: () => {
        if (viewerMode || isLockedViewer) return;
        if (selectedAnnotationId) {
          deleteAnnotation.mutate(selectedAnnotationId);
          setVideoClips((prev) =>
            prev.filter(
              (v) => v.id !== selectedAnnotationId || v.id === "base-v1",
            ),
          );
          setSelectedAnnotationId(null);
        }
      },
      Backspace: () => {
        if (viewerMode || isLockedViewer) return;
        if (selectedAnnotationId) {
          deleteAnnotation.mutate(selectedAnnotationId);
          setVideoClips((prev) =>
            prev.filter(
              (v) => v.id !== selectedAnnotationId || v.id === "base-v1",
            ),
          );
          setSelectedAnnotationId(null);
        }
      },
      "1": () => {
        if (!viewerMode && !isLockedViewer) setTool("select");
      },
      "2": () => {
        if (!viewerMode && !isLockedViewer) setTool("pen");
      },
      "3": () => {
        if (!viewerMode && !isLockedViewer) setTool("arrow");
      },
      "4": () => {
        if (!viewerMode && !isLockedViewer) setTool("rectangle");
      },
      "5": () => {
        if (!viewerMode && !isLockedViewer) setTool("text");
      },
    },
    [selectedAnnotationId, maxFrames, isLockedViewer, viewerMode],
  );

  // Push our playhead out to locked viewers whenever we're presenting.
  useEffect(() => {
    if (isPresenting) setPresenterFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, isPresenting]);

  // While locked to a presenter, mirror their playhead and give up local playback.
  useEffect(() => {
    if (!isLockedViewer) return;
    setIsPlaying(false);
    setFrame(presentation.frame);
  }, [isLockedViewer, presentation.frame]);

  // Don't leave the room "presenting" after navigating away.
  useEffect(() => {
    return () => {
      if (
        useReviewStore.getState().presentation.presenterId === currentUser?.id
      ) {
        stopPresentation();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScreenshot = async () => {
    try {
      const canvas = document.createElement("canvas");
      // Use the first video for dimensions
      const baseVideo = Array.from(videoRefs.current.values())[0];
      if (!baseVideo) return;
      canvas.width = baseVideo.videoWidth || 1920;
      canvas.height = baseVideo.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw all active videos
      videoClips.forEach((clip) => {
        if (frame >= clip.startFrame && frame <= clip.endFrame) {
          const v = videoRefs.current.get(clip.id);
          if (v) {
            ctx.globalAlpha = clip.opacity / 100;
            ctx.globalCompositeOperation =
              clip.blendMode === "normal"
                ? "source-over"
                : (clip.blendMode as GlobalCompositeOperation);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          }
        }
      });
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = "source-over";

      // Draw text overlays
      const textOverlays = document.querySelectorAll(
        '[data-annotation-marker="text"]',
      );
      const videoRect = baseVideo
        ? baseVideo.getBoundingClientRect()
        : { width: 1920, height: 1080, left: 0, top: 0 };
      const scaleX = canvas.width / videoRect.width;
      const scaleY = canvas.height / videoRect.height;

      textOverlays.forEach((input) => {
        const htmlInput = input as HTMLInputElement;
        const rect = htmlInput.getBoundingClientRect();
        const x = (rect.left - videoRect.left) * scaleX;
        const y = (rect.top - videoRect.top) * scaleY;
        ctx.font = `${(parseInt(htmlInput.style.fontSize) || 14) * scaleY}px ${htmlInput.style.fontFamily || "sans-serif"}`;
        ctx.fillStyle = htmlInput.style.color || "white";
        ctx.fillText(htmlInput.value, x + 4 * scaleX, y + 16 * scaleY);
      });

      // Draw SVG overlay
      const svgElement = document.querySelector(
        ".annotation-svg",
      ) as SVGSVGElement | null;

      const finalizeScreenshot = () => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
              ]);
              toast({
                title: "Screenshot Saved",
                description: "Frame with annotations copied!",
              });
            } catch (e) {
              toast({
                title: "Screenshot Failed",
                description: "Could not access clipboard.",
                variant: "destructive",
              });
            }
          }
        }, "image/png");
      };

      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          finalizeScreenshot();
        };
        // Encode SVG properly for Image src
        img.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
      } else {
        finalizeScreenshot();
      }
    } catch (err) {
      toast({
        title: "Screenshot Failed",
        description: "Error creating screenshot.",
        variant: "destructive",
      });
    }
  };

  // Rendering a real composite export needs a backend render service that
  // doesn't exist in this mock — the toolbar/context-menu entries below are
  // disabled with a tooltip explaining why instead of faking a progress bar
  // and a "Render Complete" toast for a file that was never produced.
  const EXPORT_UNAVAILABLE_MESSAGE =
    "Composite export isn't available yet — it requires a backend render service that isn't connected in this preview.";

  // Handle global mouse move for timeline resizing
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const hoveredFrame = Math.max(
        1,
        Math.min(maxFrames, Math.floor((x / rect.width) * maxFrames)),
      );

      if (resizing.type === "video") {
        setVideoClips((prev) =>
          prev.map((v) => {
            if (v.id !== resizing.id) return v;
            if (resizing.edge === "start")
              return {
                ...v,
                startFrame: Math.min(hoveredFrame, v.endFrame - 1),
              };
            return { ...v, endFrame: Math.max(hoveredFrame, v.startFrame + 1) };
          }),
        );
      } else {
        applyAnnotationsUpdate((prev) =>
          prev.map((a) => {
            if (a.id !== resizing.id) return a;
            const currentStart = a.startFrame ?? a.frame;
            const currentEnd = a.endFrame ?? Math.min(maxFrames, a.frame + 60);
            if (resizing.edge === "start")
              return {
                ...a,
                startFrame: Math.min(hoveredFrame, currentEnd - 1),
              };
            return { ...a, endFrame: Math.max(hoveredFrame, currentStart + 1) };
          }),
        );
      }
    };

    const handleMouseUp = () => setResizing(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, maxFrames]);

  // Handle global mouse move for canvas dragging
  useEffect(() => {
    if (!draggingElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingElement.startX;
      const dy = e.clientY - draggingElement.startY;

      if (draggingElement.type === "video") {
        setVideoClips((prev) =>
          prev.map((v) => {
            if (v.id !== draggingElement.id) return v;
            return {
              ...v,
              x: draggingElement.initialX + dx,
              y: draggingElement.initialY + dy,
            };
          }),
        );
      } else {
        applyAnnotationsUpdate((prev) =>
          prev.map((a) => {
            if (a.id !== draggingElement.id) return a;
            return {
              ...a,
              x: draggingElement.initialX + dx,
              y: draggingElement.initialY + dy,
            };
          }),
        );
      }
    };

    const handleMouseUp = () => setDraggingElement(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingElement]);

  // Handle global mouse move for A/B Wipe
  useEffect(() => {
    if (!isDraggingWipe) return;

    const handleMouseMove = (e: MouseEvent) => {
      const videoContainer = videoCanvasContainerRef.current;
      if (!videoContainer) return;
      const rect = videoContainer.getBoundingClientRect();
      let newPct = ((e.clientX - rect.left) / rect.width) * 100;
      newPct = Math.max(0, Math.min(100, newPct));
      setAbWipePosition(newPct);
    };

    const handleMouseUp = () => setIsDraggingWipe(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingWipe]);

  // Video playback engine
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = Date.now();

    if (isPlaying) {
      // Start playing all active videos, synced to current frame
      videoRefs.current.forEach((v, id) => {
        const clip = videoClips.find((c) => c.id === id);
        if (clip && frame >= clip.startFrame && frame <= clip.endFrame) {
          v.currentTime = (frame - clip.startFrame) / 24;
          v.play().catch((e) => console.log("Playback error:", e));
        }
      });

      const updateFrame = () => {
        const now = Date.now();
        const dt = now - lastTime;
        if (dt >= 1000 / 24) {
          // 24 fps
          setFrame((f) => {
            let nextF = f + 1;
            if (nextF > maxFrames) {
              nextF = 1; // loop back
              // Force seek on all videos
              videoRefs.current.forEach((v, id) => {
                const clip = videoClips.find((c) => c.id === id);
                if (
                  clip &&
                  nextF >= clip.startFrame &&
                  nextF <= clip.endFrame
                ) {
                  v.currentTime = (nextF - clip.startFrame) / 24;
                  v.play().catch(() => {});
                }
              });
            } else {
              // Check if any video just entered its active span
              videoRefs.current.forEach((v, id) => {
                const clip = videoClips.find((c) => c.id === id);
                if (clip && nextF === clip.startFrame) {
                  v.currentTime = 0;
                  v.play().catch(() => {});
                }
                if (clip && nextF === clip.endFrame + 1) {
                  v.pause();
                }
              });
            }
            return nextF;
          });
          lastTime = now;
        }
        animationFrameId = requestAnimationFrame(updateFrame);
      };
      animationFrameId = requestAnimationFrame(updateFrame);
    } else {
      // Pause all videos
      videoRefs.current.forEach((v) => v.pause());
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, videoClips]); // Don't add frame, it relies on functional state updates to avoid restarting loop

  // Sync videos to frame when scrubbing (paused)
  useEffect(() => {
    if (!isPlaying) {
      videoRefs.current.forEach((v, id) => {
        const clip = videoClips.find((c) => c.id === id);
        if (clip && frame >= clip.startFrame && frame <= clip.endFrame) {
          v.currentTime = (frame - clip.startFrame) / 24;
        }
      });
    }
  }, [frame, isPlaying, videoClips]);

  const handleSubmitComment = (audioUrl?: string, waveform?: number[]) => {
    const text = commentDraft.trim();
    if (!text && !audioUrl) return;
    addComment({
      userIndex: currentUserIndex,
      frame,
      text,
      audioUrl,
      waveform,
    });
    setCommentDraft("");
    toast({
      description: audioUrl
        ? `Voice note added at frame ${frame}.`
        : `Comment added at frame ${frame}.`,
    });
  };

  const stopMicStream = () => {
    if (waveformIntervalRef.current !== null) {
      window.clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => stopMicStream, []);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      const message = "Voice recording isn't supported in this browser.";
      setMicError(message);
      toast({
        title: "Not supported",
        description: message,
        variant: "destructive",
      });
      return;
    }

    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Real-time amplitude sampling (Web Audio) for a genuine waveform, not a decorative fake one.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      waveformSamplesRef.current = [];
      waveformIntervalRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        waveformSamplesRef.current = [
          ...waveformSamplesRef.current,
          Math.min(1, rms * 4),
        ].slice(-40);
      }, 100);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const waveform = waveformSamplesRef.current;
        stopMicStream();
        setIsRecording(false);

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        if (blob.size === 0) {
          toast({
            title: "Recording too short",
            description: "No audio was captured — try again.",
            variant: "destructive",
          });
          return;
        }
        const audioUrl = URL.createObjectURL(blob);
        handleSubmitComment(audioUrl, waveform.length ? waveform : undefined);
      };

      recorder.start();
      setIsRecording(true);
      toast({
        title: "Recording started",
        description: "Speak now. Click the record button again to stop.",
      });
    } catch (err) {
      stopMicStream();
      const isPermissionError =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError");
      const message = isPermissionError
        ? "Microphone access was denied. Allow microphone access in your browser settings to record a voice note."
        : "Couldn't access your microphone. Check that one is connected and try again.";
      setMicError(message);
      toast({
        title: "Microphone unavailable",
        description: message,
        variant: "destructive",
      });
    }
  };

  // Same fallback string the header title already computes inline just below
  // — pulled into a variable here only so FeedbackList can use it too,
  // without touching the header's existing JSX.
  const versionLabel = reviewedShot
    ? `${reviewedShot.name} ${reviewedShot.currentVersion}`
    : "SEQ_020_SH_040 v003";

  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between gap-4 px-4 shrink-0 overflow-hidden">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-8 w-8 text-muted-foreground shrink-0"
          >
            <Link href="/projects/p1">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div
            className="font-medium truncate"
            title={`FORGE REVIEW — ${reviewedShot ? `${reviewedShot.name} ${reviewedShot.currentVersion}` : "SEQ_020_SH_040 v003"}`}
          >
            FORGE REVIEW —{" "}
            {reviewedShot
              ? `${reviewedShot.name} ${reviewedShot.currentVersion}`
              : "SEQ_020_SH_040 v003"}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {viewerMode && (
            <div className="text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded border border-blue-500/30 whitespace-nowrap">
              Viewer Mode
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewerMode(!viewerMode)}
          >
            {viewerMode ? "Exit Viewer Mode" : "Read-only Reviewer"}
          </Button>
          {!isLockedViewer && canPresent && (
            <PresentationToggle
              isPresenting={isPresenting}
              onStart={() => {
                startPresentation({
                  versionId: PRESENTED_VERSION_ID,
                  presenterId: currentUser!.id,
                  presenterName: currentUser!.name,
                  frame,
                });
                toast({
                  title: "Presenting",
                  description:
                    "Your playhead is now synced across your open browser tabs on this version.",
                });
              }}
              onStop={() => {
                stopPresentation();
                toast({
                  title: "Presentation Ended",
                  description: "Viewers can scrub independently again.",
                });
              }}
            />
          )}
          {!viewerMode && isProd && (
            <Button
              size="sm"
              variant="outline"
              className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
              onClick={async () => {
                const success = await copyToClipboard(
                  window.location.origin + "/client-review",
                );
                if (success) {
                  toast({
                    title: "Link Copied",
                    description:
                      "Secure client review link copied to clipboard.",
                  });
                } else {
                  toast({
                    title: "Copy Failed",
                    description: "Could not copy link.",
                    variant: "destructive",
                  });
                }
              }}
            >
              <Link2 className="w-4 h-4 mr-2" /> Copy Client Link
            </Button>
          )}

          {!viewerMode &&
            reviewWorkflowStatus !== "approved" &&
            (isLockedViewer ? (
              // Presentation Mode: locked viewers get a collapsed action set
              // (no Reject, to keep it compact) — but it must still respect
              // the same capability + workflow-stage gating as the full
              // action bar below. This used to unconditionally call
              // submitApproval('approved', 'approved') for *any* locked
              // viewer regardless of role or review stage, which let anyone
              // just watching a presentation jump the version straight to
              // "approved" — skipping the Lead/Manager tiers entirely and
              // bypassing the submit/approve capability checks below.
              <div className="flex items-center gap-2">
                {canSubmitReview && reviewWorkflowStatus === "wip" && (
                  <Button
                    size="sm"
                    className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                    onClick={() => {
                      submitApproval(
                        "lead-review",
                        "submitted-for-lead-review",
                      );
                      toast({
                        title: "Submitted",
                        description: "Submitted for Lead Review",
                      });
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" /> Submit
                  </Button>
                )}
                {canApproveReview && reviewWorkflowStatus === "lead-review" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                      onClick={() => {
                        submitApproval("approved", "published");
                        toast({
                          title: "Published",
                          description: "Approved & Published to Production",
                        });
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#B5651D] hover:bg-[#B5651D]/90 text-white"
                      onClick={() => {
                        submitApproval("in-progress", "changes-requested");
                        toast({ title: "Changes Requested" });
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" /> Request Changes
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {canSubmitReview && reviewWorkflowStatus === "wip" && (
                  <Button
                    size="sm"
                    className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                    onClick={() => {
                      submitApproval(
                        "lead-review",
                        "submitted-for-lead-review",
                      );
                      toast({
                        title: "Submitted",
                        description: "Submitted for Lead Review",
                      });
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" /> Submit to
                    Lead/Supervisor for Review
                  </Button>
                )}

                {/* Lead/Supervisor can only act once the Artist has actually
                    submitted for Lead review — mirrors the Artist button's
                    own 'wip' gate above so the UI can't fabricate an
                    approval step that never happened. This is now the
                    single, final internal sign-off (the former separate
                    Manager tier is gone), so approving here publishes
                    straight to production. */}
                {canApproveReview && reviewWorkflowStatus === "lead-review" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                      onClick={() => {
                        submitApproval("approved", "published");
                        toast({
                          title: "Published",
                          description: "Approved & Published to Production",
                        });
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve &
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#B5651D] hover:bg-[#B5651D]/90 text-white"
                      onClick={() => {
                        submitApproval("in-progress", "changes-requested");
                        toast({ title: "Changes Requested" });
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" /> Request
                      Changes
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#A03030] hover:bg-[#A03030]/90 text-white"
                      onClick={() => {
                        submitApproval("in-progress", "rejected");
                        toast({ title: "Rejected" });
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" /> Reject
                    </Button>
                  </>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Mode switch: "Player" is the full annotation tool (unchanged below,
          untouched by this addition); "Feedback" is a lightweight read view
          of the same comment stream, built for small screens and anyone who
          just wants to read notes on a submission without the heavy tool. */}
      <div className="border-b border-border bg-card/50 px-4 py-2 shrink-0">
        <Tabs
          value={pageMode}
          onValueChange={(v) => setPageMode(v as "player" | "feedback")}
        >
          <TabsList className="h-auto p-1">
            <TabsTrigger value="player" className="touch-target gap-1.5 px-3">
              <Film className="w-4 h-4" /> Player
            </TabsTrigger>
            <TabsTrigger value="feedback" className="touch-target gap-1.5 px-3">
              <MessageSquare className="w-4 h-4" /> Feedback
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {pageMode === "feedback" && (
        <FeedbackList
          versionLabel={versionLabel}
          workflowStatus={reviewWorkflowStatus}
          // Presentation Mode already disables independent frame control for
          // locked viewers everywhere else on this page (see isLockedViewer
          // checks throughout) — mirror that here instead of letting a
          // locked viewer's tap fight the presenter's synced playhead.
          onJumpToFrame={
            isLockedViewer
              ? undefined
              : (f) => {
                  setFrame(f);
                  setPageMode("player");
                }
          }
        />
      )}

      {pageMode === "player" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Player */}
          <div className="flex-1 flex flex-col bg-black relative">
            {!viewerMode && (
              <motion.div
                layout
                transition={cut.transition}
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur border border-border rounded-lg p-1.5 flex gap-3 z-30",
                  // The presentation-lock banner sits top-4 left-4; when it's
                  // showing, drop the toolbar below it instead of letting the
                  // two collide over the horizontal center.
                  isLockedViewer ? "top-16" : "top-4",
                )}
              >
                <div className="flex gap-1 items-center">
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const newId = `v${videoClips.length + 1}`;
                        setVideoClips((prev) => [
                          ...prev,
                          {
                            id: newId,
                            src: URL.createObjectURL(file),
                            trackIndex: prev.length,
                            startFrame: frame,
                            endFrame: Math.min(frame + 60, maxFrames),
                            opacity: 100,
                            blendMode: "normal",
                            name: file.name,
                            x: 0,
                            y: 0,
                            scale: 1,
                          },
                        ]);
                        toast({
                          title: "Video Added",
                          description: `Track ${videoClips.length + 1} added.`,
                        });
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Upload Demo Video"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <AnnotationToolbar
                  tool={isLockedViewer ? "select" : tool}
                  onToolChange={setTool}
                  color={color}
                  onColorChange={setColor}
                  colors={COLORS}
                />
                <div className="w-px h-6 bg-border mx-2" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAbWipe(!abWipe)}
                  title="Toggle A/B Wipe"
                  className={abWipe ? "text-primary bg-primary/10" : ""}
                >
                  <SplitSquareHorizontal className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOnionSkin(!onionSkin)}
                  title="Toggle Onion Skinning"
                  className={onionSkin ? "text-primary bg-primary/10" : ""}
                >
                  <Layers className="w-4 h-4" />
                </Button>
                <GhostingToggle
                  active={ghosting}
                  onToggle={() => setGhosting(!ghosting)}
                />
                <div className="w-px h-6 bg-border mx-2" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setCompareMode((prev) =>
                      prev === "off"
                        ? "side-by-side"
                        : prev === "side-by-side"
                          ? "overlay"
                          : "off",
                    )
                  }
                  title={
                    compareMode === "off"
                      ? "Compare Versions (Side-by-Side)"
                      : compareMode === "side-by-side"
                        ? "Compare (Overlay)"
                        : "Exit Compare"
                  }
                  className={
                    compareMode !== "off" ? "text-primary bg-primary/10" : ""
                  }
                >
                  <Columns2 className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-2" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleScreenshot}
                  title="Copy Screenshot to Clipboard"
                >
                  <Camera className="w-4 h-4" />
                </Button>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled
                          className="text-muted-foreground/50"
                        >
                          <Film className="w-4 h-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[220px] text-xs"
                    >
                      {EXPORT_UNAVAILABLE_MESSAGE}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </motion.div>
            )}

            {/* VERSION COMPARISON MODE */}
            {compareMode !== "off" && (
              <div className="absolute inset-0 z-40 bg-black flex flex-col">
                {/* Compare Header */}
                <div className="h-10 bg-card/90 backdrop-blur border-b border-border flex items-center justify-between px-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <GitCompareArrows className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">
                      Version Compare —{" "}
                      {compareMode === "side-by-side"
                        ? "Side by Side"
                        : "Overlay"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant={
                        compareMode === "side-by-side" ? "secondary" : "ghost"
                      }
                      className="h-7 text-xs"
                      onClick={() => setCompareMode("side-by-side")}
                    >
                      <Columns2 className="w-3 h-3 mr-1" /> Side-by-Side
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        compareMode === "overlay" ? "secondary" : "ghost"
                      }
                      className="h-7 text-xs"
                      onClick={() => setCompareMode("overlay")}
                    >
                      <Layers className="w-3 h-3 mr-1" /> Overlay
                    </Button>
                    <div className="w-px h-5 bg-border" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setCompareMode("off")}
                    >
                      Exit Compare
                    </Button>
                  </div>
                </div>

                {/* Version Selectors */}
                <div className="flex items-center justify-center gap-8 py-2 bg-card/50 backdrop-blur border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      A:
                    </span>
                    <Select
                      value={compareVersionA}
                      onValueChange={setCompareVersionA}
                    >
                      <SelectTrigger className="w-48 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VERSIONS.map((v) => (
                          <SelectItem
                            key={v.id}
                            value={v.id}
                            className="text-xs"
                          >
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {compareMode === "overlay" && (
                    <div className="flex items-center gap-2 w-48">
                      <span className="text-xs text-muted-foreground">
                        Opacity
                      </span>
                      <Slider
                        value={[overlayOpacity]}
                        onValueChange={(v) => setOverlayOpacity(v[0])}
                        min={0}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-xs font-mono w-8 text-right">
                        {overlayOpacity}%
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      B:
                    </span>
                    <Select
                      value={compareVersionB}
                      onValueChange={setCompareVersionB}
                    >
                      <SelectTrigger className="w-48 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VERSIONS.map((v) => (
                          <SelectItem
                            key={v.id}
                            value={v.id}
                            className="text-xs"
                          >
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Compare Viewport */}
                <div
                  className={`flex-1 flex ${compareMode === "side-by-side" ? "flex-row gap-1" : "relative"} p-2 overflow-hidden`}
                >
                  {/* Version A */}
                  <div
                    className={`${compareMode === "side-by-side" ? "flex-1" : "absolute inset-2"} relative bg-black rounded overflow-hidden border border-border/30`}
                  >
                    <video
                      ref={compareVideoRefA}
                      src={VERSIONS.find((v) => v.id === compareVersionA)?.src}
                      poster={getPlaceholderThumbnail(
                        hashString(compareVersionA),
                        1280,
                        720,
                      )}
                      className="w-full h-full object-contain"
                      muted
                      playsInline
                    />
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur px-2 py-0.5 rounded text-xs font-mono text-green-400">
                      A —{" "}
                      {VERSIONS.find((v) => v.id === compareVersionA)?.label}
                    </div>
                  </div>
                  {/* Version B */}
                  <div
                    className={`${compareMode === "side-by-side" ? "flex-1" : "absolute inset-2"} relative bg-black rounded overflow-hidden border border-border/30`}
                    style={
                      compareMode === "overlay"
                        ? {
                            opacity: overlayOpacity / 100,
                            mixBlendMode: "difference",
                          }
                        : undefined
                    }
                  >
                    <video
                      ref={compareVideoRefB}
                      src={VERSIONS.find((v) => v.id === compareVersionB)?.src}
                      poster={getPlaceholderThumbnail(
                        hashString(compareVersionB),
                        1280,
                        720,
                      )}
                      className="w-full h-full object-contain"
                      muted
                      playsInline
                    />
                    <div className="absolute top-2 right-2 bg-black/70 backdrop-blur px-2 py-0.5 rounded text-xs font-mono text-blue-400">
                      B —{" "}
                      {VERSIONS.find((v) => v.id === compareVersionB)?.label}
                    </div>
                  </div>
                </div>

                {/* Compare Scrubber */}
                <div className="h-12 bg-card/90 backdrop-blur border-t border-border flex items-center px-6 gap-4 shrink-0">
                  <PlaybackControls
                    isPlaying={isPlaying}
                    disabled={isLockedViewer}
                    onTogglePlay={() => setIsPlaying(!isPlaying)}
                    onStepBack={() => {
                      setIsPlaying(false);
                      setFrame((f) => Math.max(1, f - 1));
                    }}
                    onStepForward={() => {
                      setIsPlaying(false);
                      setFrame((f) => Math.min(maxFrames, f + 1));
                    }}
                    frame={frame}
                    maxFrames={maxFrames}
                    buttonClassName="h-7 w-7"
                    iconClassName="w-3.5 h-3.5"
                  />
                  <FrameScrubber
                    frame={frame}
                    maxFrames={maxFrames}
                    disabled={isLockedViewer}
                    onFrameChange={(f) => {
                      setIsPlaying(false);
                      setFrame(f);
                    }}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-muted-foreground">
                    {String(frame).padStart(3, "0")} / {maxFrames}
                  </span>
                </div>
              </div>
            )}

            <div className="flex-1 relative flex items-center justify-center">
              <div
                ref={videoCanvasContainerRef}
                className="w-full aspect-video bg-muted/10 border border-border/20 shadow-2xl relative overflow-hidden"
              >
                {videoClips.map((clip) => {
                  const isActive =
                    frame >= clip.startFrame && frame <= clip.endFrame;
                  return (
                    <ContextMenu key={clip.id}>
                      <ContextMenuTrigger asChild>
                        {(() => {
                          const ext = clip.src.split(".").pop()?.toLowerCase();
                          const isVideo = ["mp4", "webm", "mov"].includes(
                            ext || "",
                          );
                          const isImage = [
                            "png",
                            "jpg",
                            "jpeg",
                            "gif",
                            "webp",
                          ].includes(ext || "");
                          const isDCC = !isVideo && !isImage;

                          if (isDCC) {
                            return (
                              <div
                                className={`absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-card text-muted-foreground ${isActive ? "opacity-100" : "opacity-0 hidden"} ${tool === "select" ? "cursor-move" : ""}`}
                                style={{
                                  opacity: clip.opacity / 100,
                                  zIndex:
                                    selectedAnnotationId === clip.id ? 5 : 1,
                                }}
                                onMouseDown={(e) => {
                                  if (
                                    canEdit &&
                                    tool === "select" &&
                                    e.button !== 2
                                  ) {
                                    e.stopPropagation();
                                    setSelectedAnnotationId(clip.id);
                                    setDraggingElement({
                                      id: clip.id,
                                      type: "video",
                                      startX: e.clientX,
                                      startY: e.clientY,
                                      initialX: clip.x || 0,
                                      initialY: clip.y || 0,
                                    });
                                  }
                                }}
                              >
                                <Package className="w-16 h-16 mb-4 opacity-50" />
                                <div className="text-xl font-bold">
                                  {clip.src.split("/").pop()}
                                </div>
                                <div className="text-sm mt-2">
                                  DCC Asset File (No Web Preview Available)
                                </div>
                              </div>
                            );
                          }

                          if (isImage) {
                            return (
                              <img
                                src={clip.src}
                                className={`absolute inset-0 w-full h-full object-contain ${isActive ? "opacity-100" : "opacity-0 hidden"} ${tool === "select" ? "cursor-move" : ""}`}
                                style={{
                                  opacity: clip.opacity / 100,
                                  mixBlendMode: clip.blendMode,
                                  pointerEvents:
                                    tool === "select" ? "auto" : "none",
                                  transform: `translate(${clip.x || 0}px, ${clip.y || 0}px) scale(${clip.scale || 1})`,
                                  zIndex:
                                    selectedAnnotationId === clip.id ? 5 : 1,
                                  clipPath:
                                    abWipe && clip.id !== "base-v1"
                                      ? `polygon(0 0, ${abWipePosition}% 0, ${abWipePosition}% 100%, 0 100%)`
                                      : undefined,
                                }}
                                onMouseDown={(e) => {
                                  if (
                                    canEdit &&
                                    tool === "select" &&
                                    e.button !== 2
                                  ) {
                                    e.stopPropagation();
                                    setSelectedAnnotationId(clip.id);
                                    setDraggingElement({
                                      id: clip.id,
                                      type: "video",
                                      startX: e.clientX,
                                      startY: e.clientY,
                                      initialX: clip.x || 0,
                                      initialY: clip.y || 0,
                                    });
                                  }
                                }}
                              />
                            );
                          }

                          return (
                            <video
                              ref={(el) => {
                                if (el) videoRefs.current.set(clip.id, el);
                                else videoRefs.current.delete(clip.id);
                              }}
                              src={clip.src}
                              poster={getPlaceholderThumbnail(
                                hashString(clip.id),
                                1280,
                                720,
                              )}
                              className={`absolute inset-0 w-full h-full object-contain ${isActive ? "opacity-100" : "opacity-0 hidden"} ${tool === "select" ? "cursor-move" : ""}`}
                              style={{
                                opacity: clip.opacity / 100,
                                mixBlendMode: clip.blendMode,
                                pointerEvents:
                                  tool === "select" ? "auto" : "none",
                                transform: `translate(${clip.x || 0}px, ${clip.y || 0}px) scale(${clip.scale || 1})`,
                                zIndex:
                                  selectedAnnotationId === clip.id ? 5 : 1,
                                clipPath:
                                  abWipe && clip.id !== "base-v1"
                                    ? `polygon(0 0, ${abWipePosition}% 0, ${abWipePosition}% 100%, 0 100%)`
                                    : undefined,
                              }}
                              onMouseDown={(e) => {
                                if (
                                  canEdit &&
                                  tool === "select" &&
                                  e.button !== 2
                                ) {
                                  e.stopPropagation();
                                  setSelectedAnnotationId(clip.id);
                                  setDraggingElement({
                                    id: clip.id,
                                    type: "video",
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    initialX: clip.x || 0,
                                    initialY: clip.y || 0,
                                  });
                                }
                              }}
                              muted
                              playsInline
                            />
                          );
                        })()}
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 z-50">
                        <ContextMenuItem
                          disabled={clip.id === "base-v1" || !canEdit}
                          onClick={() => {
                            setVideoClips((prev) =>
                              prev.filter((v) => v.id !== clip.id),
                            );
                            if (selectedAnnotationId === clip.id)
                              setSelectedAnnotationId(null);
                            toast({
                              title: "Video Deleted",
                              description: "Clip removed from composition.",
                            });
                          }}
                          className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                        >
                          Delete Video
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          disabled
                          title={EXPORT_UNAVAILABLE_MESSAGE}
                        >
                          Merge & Render Composite (Unavailable)
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}

                {/* A/B Wipe Slider */}
                {abWipe && (
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-primary z-40 cursor-ew-resize flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                    style={{ left: `${abWipePosition}%` }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setIsDraggingWipe(true);
                    }}
                  >
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                      <SplitSquareHorizontal className="w-3 h-3 text-primary-foreground" />
                    </div>
                  </div>
                )}

                <AnnotationCanvas
                  annotations={annotations}
                  onAnnotationsChange={applyAnnotationsUpdate}
                  frame={frame}
                  maxFrames={maxFrames}
                  tool={isLockedViewer || viewerMode ? "select" : tool}
                  color={color}
                  colors={COLORS}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectedAnnotationIdChange={setSelectedAnnotationId}
                  onDraggingElementChange={setDraggingElement}
                  currentUserId={currentUser?.id}
                  onionSkin={onionSkin}
                  ghosting={ghosting}
                  readOnly={viewerMode || isLockedViewer}
                />

                {/* Mock Remote Cursors Overlay */}
                {remoteCursors
                  .filter((c) => c.active)
                  .map((cursor) => (
                    <div
                      key={cursor.id}
                      className="absolute pointer-events-none z-[60] transition-all duration-300 ease-out"
                      style={{ left: cursor.x, top: cursor.y }}
                    >
                      <MousePointer2
                        className="w-5 h-5 drop-shadow-md"
                        style={{
                          fill: cursor.color,
                          stroke: "white",
                          strokeWidth: 1.5,
                        }}
                      />
                      <div
                        className="absolute top-5 left-3 px-1.5 py-0.5 rounded text-[10px] text-white font-semibold whitespace-nowrap shadow-sm"
                        style={{ backgroundColor: cursor.color }}
                      >
                        {cursor.name}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Presentation Mode lock indicator */}
              <div className="absolute top-4 left-4 z-40">
                <PresentationLockBanner
                  show={isLockedViewer}
                  presenterName={presentation.presenterName}
                  frame={presentation.frame}
                  maxFrames={maxFrames}
                />
              </div>

              {/* Contextual Cut Management Overlay. Scoped to this
                  video-canvas-only container (not the outer player column,
                  which also contains the h-48 timeline/scrubber below) so
                  `bottom-*` positions it against the bottom of the video
                  frame instead of the bottom of the whole pane — previously
                  it was a sibling of the timeline section and `bottom-6`
                  placed it on top of the frame scrubber. */}
              {!viewerMode && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-6 z-30 pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
                  <div className="bg-card/90 backdrop-blur border border-border rounded-lg p-2 flex flex-col items-center gap-1 shadow-lg pointer-events-auto cursor-pointer hover:border-primary/50 transition-colors">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      Previous Shot
                    </span>
                    <div className="w-32 h-18 bg-muted rounded overflow-hidden relative">
                      <img
                        src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80"
                        className="w-full h-full object-cover"
                        alt="prev-shot"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-mono text-xs font-bold text-white">
                        S01_030
                      </div>
                    </div>
                  </div>
                  <div className="bg-card/90 backdrop-blur border border-border rounded-lg p-2 flex flex-col items-center gap-1 shadow-lg pointer-events-auto cursor-pointer hover:border-primary/50 transition-colors">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      Next Shot
                    </span>
                    <div className="w-32 h-18 bg-muted rounded overflow-hidden relative">
                      <img
                        src="https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=400&q=80"
                        className="w-full h-full object-cover"
                        alt="next-shot"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-mono text-xs font-bold text-white">
                        S01_050
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-48 bg-card border-t border-border flex flex-col shrink-0">
              {/* Timeline Tools */}
              <div className="h-10 border-b border-border flex items-center px-4 gap-4">
                <PlaybackControls
                  isPlaying={isPlaying}
                  disabled={isLockedViewer}
                  onTogglePlay={() => setIsPlaying(!isPlaying)}
                  onStepBack={() => {
                    setIsPlaying(false);
                    setFrame((f) => Math.max(1, f - 1));
                  }}
                  onStepForward={() => {
                    setIsPlaying(false);
                    setFrame((f) => Math.min(maxFrames, f + 1));
                  }}
                  frame={frame}
                  maxFrames={maxFrames}
                  buttonClassName="h-6 w-6"
                />
                <span className="text-xs font-mono">
                  {String(frame).padStart(3, "0")} / {maxFrames}
                </span>
              </div>
              {/* Timeline Tracks */}
              <div
                ref={timelineRef}
                className={`flex-1 overflow-y-auto relative p-2 space-y-1 bg-muted/10 ${isLockedViewer ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                onMouseDown={(e) => {
                  if (resizing || isLockedViewer) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const newFrame = Math.max(
                    1,
                    Math.min(
                      maxFrames,
                      Math.floor((x / rect.width) * maxFrames),
                    ),
                  );
                  setFrame(newFrame);
                }}
              >
                {/* Video Tracks */}
                {videoClips.map((clip, index) => (
                  <div
                    key={clip.id}
                    className="flex h-8 w-full bg-muted/20 rounded relative"
                  >
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          className={`absolute h-full transition-colors ${selectedAnnotationId === clip.id ? "border-2 border-primary ring-2 ring-primary/50 hover:bg-blue-500/30" : "border border-blue-500/50 hover:bg-blue-500/30"} bg-blue-500/20 rounded flex items-center px-2 text-[10px] text-blue-500 font-medium overflow-hidden group cursor-pointer`}
                          style={{
                            left: `${(clip.startFrame / maxFrames) * 100}%`,
                            width: `${((clip.endFrame - clip.startFrame) / maxFrames) * 100}%`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAnnotationId(clip.id);
                          }}
                        >
                          {clip.name} (V{index + 1})
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-blue-500/50 hover:w-3 z-20"
                            onMouseDown={(e) => {
                              if (!canEdit) return;
                              e.stopPropagation();
                              setResizing({
                                id: clip.id,
                                type: "video",
                                edge: "start",
                              });
                            }}
                          />
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-blue-500/50 hover:w-3 z-20"
                            onMouseDown={(e) => {
                              if (!canEdit) return;
                              e.stopPropagation();
                              setResizing({
                                id: clip.id,
                                type: "video",
                                edge: "end",
                              });
                            }}
                          />
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48 z-50">
                        <ContextMenuItem
                          disabled={clip.id === "base-v1" || !canEdit}
                          onClick={(e) => {
                            e.stopPropagation();
                            setVideoClips((prev) =>
                              prev.filter((v) => v.id !== clip.id),
                            );
                            if (selectedAnnotationId === clip.id)
                              setSelectedAnnotationId(null);
                            toast({
                              title: "Video Deleted",
                              description: "Clip removed.",
                            });
                          }}
                          className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                        >
                          Delete Video
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          disabled
                          title={EXPORT_UNAVAILABLE_MESSAGE}
                        >
                          Merge & Render Composite (Unavailable)
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                ))}
                {/* Annotations Track */}
                <div className="flex h-16 w-full bg-muted/20 rounded relative">
                  {annotations.map((a) => {
                    const start = a.startFrame ?? a.frame;
                    const end = a.endFrame ?? Math.min(maxFrames, a.frame + 60);
                    const left = (start / maxFrames) * 100;
                    const width = ((end - start) / maxFrames) * 100;

                    return (
                      <ContextMenu key={a.id}>
                        <ContextMenuTrigger asChild>
                          <div
                            className={`absolute h-full rounded cursor-pointer transition-colors overflow-hidden flex items-center group ${selectedAnnotationId === a.id ? "bg-primary/50 border-2 hover:bg-primary/60" : "bg-primary/30 border hover:bg-primary/40"}`}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              borderColor: a.color,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAnnotationId(a.id);
                            }}
                          >
                            <span
                              className={`text-[10px] font-medium px-1 truncate capitalize`}
                              style={{ color: a.color }}
                            >
                              {a.text || a.type}
                            </span>
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-black/40 hover:w-3 z-20"
                              onMouseDown={(e) => {
                                if (!canEdit) return;
                                e.stopPropagation();
                                setResizing({
                                  id: a.id,
                                  type: "annotation",
                                  edge: "start",
                                });
                              }}
                            />
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-black/40 hover:w-3 z-20"
                              onMouseDown={(e) => {
                                if (!canEdit) return;
                                e.stopPropagation();
                                setResizing({
                                  id: a.id,
                                  type: "annotation",
                                  edge: "end",
                                });
                              }}
                            />
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48 z-50">
                          <ContextMenuItem
                            disabled={!canEdit}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAnnotation.mutate(a.id);
                              if (selectedAnnotationId === a.id)
                                setSelectedAnnotationId(null);
                              toast({ title: "Annotation Deleted" });
                            }}
                            className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                          >
                            Delete Annotation
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 pointer-events-none"
                  style={{ left: `${(frame / maxFrames) * 100}%` }}
                >
                  <div className="absolute top-0 -translate-x-1/2 w-3 h-3 rotate-45 bg-red-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Comments & Properties */}
          <div className="w-80 bg-card border-l border-border flex flex-col shrink-0">
            <Tabs
              defaultValue="comments"
              className="flex-1 flex flex-col h-full"
            >
              <div className="p-4 border-b border-border bg-muted/10 shrink-0">
                <TabsList className="w-full">
                  <TabsTrigger value="comments" className="flex-1">
                    Comments
                  </TabsTrigger>
                  <TabsTrigger value="client" className="flex-1 gap-1.5">
                    Client
                    <AnimatePresence mode="popLayout">
                      {pendingClientNotes.length > 0 && (
                        <motion.span
                          key={pendingClientNotes.length}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 25,
                          }}
                          className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[10px] font-semibold text-black"
                        >
                          {pendingClientNotes.length}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </TabsTrigger>
                  <TabsTrigger value="properties" className="flex-1">
                    Properties
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="comments"
                className="flex-1 flex flex-col m-0 h-full overflow-hidden data-[state=inactive]:hidden"
              >
                <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      APPROVAL CHAIN
                    </div>
                  </div>
                  <div className="space-y-2">
                    {reviewWorkflowStatus === "wip" ? (
                      <div className="text-sm text-muted-foreground italic">
                        No review requested yet.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-[#1E7A34]" />{" "}
                          Artist{" "}
                          <span className="text-xs text-muted-foreground ml-auto">
                            Submitted
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {reviewWorkflowStatus === "lead-review" ? (
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50 border-t-primary animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-[#1E7A34]" />
                          )}
                          Lead{" "}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {reviewWorkflowStatus === "lead-review"
                              ? "Pending"
                              : "Approved"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {reviewedTask &&
                    (reviewedTask.approvalHistory?.length ?? 0) > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                        <div className="text-[10px] font-semibold text-muted-foreground/70 tracking-wide mb-1.5">
                          HISTORY
                        </div>
                        <AnimatePresence initial={false}>
                          {[...reviewedTask.approvalHistory]
                            .reverse()
                            .map((ev) => (
                              <motion.div
                                key={ev.id}
                                layout
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-start gap-2 text-xs"
                              >
                                <ApprovalActionIcon action={ev.action} />
                                <div className="flex-1 min-w-0">
                                  <span className="text-foreground font-medium">
                                    {ev.byUserName}
                                  </span>{" "}
                                  <span className="text-muted-foreground">
                                    {APPROVAL_ACTION_LABEL[ev.action]}
                                  </span>
                                  <div className="text-[10px] text-muted-foreground/70">
                                    {new Date(ev.timestamp).toLocaleString()}
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                        </AnimatePresence>
                      </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {comments.map((comment) => {
                    const user = comment.fromClient
                      ? null
                      : USERS[comment.userIndex];
                    const displayName = comment.fromClient
                      ? comment.fromClient.authorName
                      : (user?.name ?? "Unknown");
                    return (
                      <div className="flex gap-3" key={comment.id}>
                        <Avatar className="w-8 h-8">
                          {user && <AvatarImage src={user.avatar} />}
                          <AvatarFallback
                            className={
                              comment.fromClient
                                ? "bg-emerald-500/15 text-emerald-500"
                                : undefined
                            }
                          >
                            {displayName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-sm">
                              {displayName}
                            </span>
                            {comment.fromClient && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Client · transferred by{" "}
                                {comment.fromClient.transferredByUserName}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={isLockedViewer}
                              className="text-xs font-mono bg-primary/10 text-primary px-1 rounded hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label={`Jump to frame ${comment.frame}`}
                              onClick={() =>
                                !isLockedViewer && setFrame(comment.frame)
                              }
                            >
                              {String(comment.frame).padStart(3, "0")}
                            </button>
                          </div>
                          {comment.text && (
                            <p className="text-sm text-muted-foreground">
                              {comment.text}
                            </p>
                          )}
                          <VoiceNotePlayer comment={comment} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!viewerMode && (
                  <div className="p-4 border-t border-border bg-card shrink-0">
                    <textarea
                      className="w-full h-24 bg-muted/50 border border-border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary mb-2"
                      placeholder="Add a comment... (Press Enter to submit)"
                      aria-label="Add a comment"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (commentDraft.trim()) handleSubmitComment();
                        }
                      }}
                    />
                    {micError && (
                      <div className="flex items-start gap-1.5 text-xs text-destructive mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{micError}</span>
                      </div>
                    )}
                    <div className="flex gap-2 relative">
                      <Button
                        variant={isRecording ? "destructive" : "outline"}
                        size="icon"
                        className={`shrink-0 ${isRecording ? "animate-pulse" : ""}`}
                        onClick={toggleRecording}
                        aria-label={
                          isRecording ? "Stop Recording" : "Record Voice Note"
                        }
                      >
                        {isRecording ? (
                          <SquareIcon className="w-4 h-4 fill-current" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          // A "stamp" is a real, persisted marker comment at the
                          // current frame — not just a toast — so it actually
                          // shows up in the Comments stream (and survives
                          // reload) like any other note left on the timeline.
                          addComment({
                            userIndex: currentUserIndex,
                            frame,
                            text: "Frame stamped for reference.",
                          });
                          toast({ description: `Frame ${frame} stamped.` });
                        }}
                      >
                        Stamp F{frame}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!commentDraft.trim() && !isRecording}
                        onClick={() => handleSubmitComment()}
                      >
                        Submit
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent
                value="client"
                className="flex-1 flex flex-col m-0 h-full overflow-hidden data-[state=inactive]:hidden"
              >
                <div className="p-4 border-b border-border bg-muted/20 shrink-0 flex items-start gap-2">
                  <Inbox className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Notes clients leave in the review portal land here first.
                    Transfer a note to publish it into the Comments stream where
                    the whole team can see it.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {clientNotes.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic text-center mt-10">
                      No client feedback yet.
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {[...clientNotes].reverse().map((note) => (
                        <motion.div
                          layout
                          key={note.id}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: 0.2 }}
                          className={cn(
                            "rounded-lg border p-3 text-sm",
                            note.transferred
                              ? "border-border/50 bg-muted/10 opacity-70"
                              : "border-amber-500/30 bg-amber-500/5",
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className="font-medium text-xs">
                              {note.authorName}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              F{String(note.frame).padStart(3, "0")} ·{" "}
                              {note.shotName}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-sm mb-2">
                            {note.text}
                          </p>
                          {note.transferred ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-[#1E7A34]">
                              <CheckCircle2 className="w-3 h-3" />
                              Transferred by {note.transferredByUserName} ·{" "}
                              {note.transferredAt
                                ? new Date(note.transferredAt).toLocaleString()
                                : ""}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                              disabled={!currentUser}
                              onClick={() => {
                                if (!currentUser) return;
                                transferClientNote(note.id, currentUser.name);
                                toast({
                                  title: "Feedback Transferred",
                                  description:
                                    "The client note is now visible in the team comment stream.",
                                });
                              }}
                            >
                              <Send className="w-3 h-3 mr-1.5" /> Transfer to
                              Team
                            </Button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="properties"
                className="flex-1 overflow-y-auto p-4 m-0 space-y-6 data-[state=inactive]:hidden"
              >
                {!selectedAnnotationId ? (
                  <div className="text-sm text-muted-foreground text-center mt-10">
                    Select a track or annotation on the timeline to edit
                    properties.
                  </div>
                ) : (
                  (() => {
                    const ann = annotations.find(
                      (a) => a.id === selectedAnnotationId,
                    );
                    const clip = videoClips.find(
                      (v) => v.id === selectedAnnotationId,
                    );

                    if (clip) {
                      return (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              Track Name
                            </Label>
                            <input
                              type="text"
                              disabled={!canEdit}
                              className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                              value={clip.name}
                              onChange={(e) =>
                                setVideoClips((prev) =>
                                  prev.map((p) =>
                                    p.id === clip.id
                                      ? { ...p, name: e.target.value }
                                      : p,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                                Start Frame
                              </Label>
                              <input
                                type="number"
                                min={1}
                                max={maxFrames}
                                disabled={!canEdit}
                                className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                value={clip.startFrame}
                                onChange={(e) =>
                                  setVideoClips((prev) =>
                                    prev.map((p) =>
                                      p.id === clip.id
                                        ? {
                                            ...p,
                                            startFrame: parseInt(
                                              e.target.value,
                                            ),
                                          }
                                        : p,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                                End Frame
                              </Label>
                              <input
                                type="number"
                                min={1}
                                max={maxFrames}
                                disabled={!canEdit}
                                className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                value={clip.endFrame}
                                onChange={(e) =>
                                  setVideoClips((prev) =>
                                    prev.map((p) =>
                                      p.id === clip.id
                                        ? {
                                            ...p,
                                            endFrame: parseInt(e.target.value),
                                          }
                                        : p,
                                    ),
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              Opacity ({clip.opacity}%)
                            </Label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              disabled={!canEdit}
                              className="w-full accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                              value={clip.opacity}
                              onChange={(e) =>
                                setVideoClips((prev) =>
                                  prev.map((p) =>
                                    p.id === clip.id
                                      ? {
                                          ...p,
                                          opacity: parseInt(e.target.value),
                                        }
                                      : p,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              Blend Mode
                            </Label>
                            <select
                              disabled={!canEdit}
                              className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                              value={clip.blendMode}
                              onChange={(e) =>
                                setVideoClips((prev) =>
                                  prev.map((p) =>
                                    p.id === clip.id
                                      ? {
                                          ...p,
                                          blendMode: e.target.value as any,
                                        }
                                      : p,
                                  ),
                                )
                              }
                            >
                              <option value="normal">Normal</option>
                              <option value="multiply">Multiply</option>
                              <option value="screen">Screen</option>
                              <option value="overlay">Overlay</option>
                              <option value="difference">Difference</option>
                            </select>
                          </div>
                        </div>
                      );
                    }

                    if (!ann)
                      return (
                        <div className="text-sm text-muted-foreground text-center mt-10">
                          Select an item on the timeline.
                        </div>
                      );
                    return (
                      <div className="space-y-4">
                        {ann.type === "text" && (
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              Text Content
                            </Label>
                            <input
                              type="text"
                              disabled={!canEdit}
                              className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                              value={ann.text || ""}
                              onChange={(e) =>
                                applyAnnotationsUpdate((prev) =>
                                  prev.map((p) =>
                                    p.id === ann.id
                                      ? { ...p, text: e.target.value }
                                      : p,
                                  ),
                                )
                              }
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              Start Frame
                            </Label>
                            <input
                              type="number"
                              min={1}
                              max={maxFrames}
                              disabled={!canEdit}
                              className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                              value={ann.startFrame ?? ann.frame}
                              onChange={(e) =>
                                applyAnnotationsUpdate((prev) =>
                                  prev.map((p) =>
                                    p.id === ann.id
                                      ? {
                                          ...p,
                                          startFrame: parseInt(e.target.value),
                                        }
                                      : p,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              End Frame
                            </Label>
                            <input
                              type="number"
                              min={1}
                              max={maxFrames}
                              disabled={!canEdit}
                              className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                              value={
                                ann.endFrame ??
                                Math.min(maxFrames, ann.frame + 60)
                              }
                              onChange={(e) =>
                                applyAnnotationsUpdate((prev) =>
                                  prev.map((p) =>
                                    p.id === ann.id
                                      ? {
                                          ...p,
                                          endFrame: parseInt(e.target.value),
                                        }
                                      : p,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>

                        {ann.type === "text" && (
                          <>
                            <div>
                              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                                Font Family
                              </Label>
                              <Select
                                disabled={!canEdit}
                                value={ann.fontFamily || "font-sans"}
                                onValueChange={(v) =>
                                  applyAnnotationsUpdate((prev) =>
                                    prev.map((p) =>
                                      p.id === ann.id
                                        ? { ...p, fontFamily: v }
                                        : p,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="font-sans">
                                    Sans-serif
                                  </SelectItem>
                                  <SelectItem value="font-serif">
                                    Serif
                                  </SelectItem>
                                  <SelectItem value="font-mono">
                                    Monospace
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                                Font Size
                              </Label>
                              <input
                                type="number"
                                disabled={!canEdit}
                                className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                value={ann.fontSize || 14}
                                onChange={(e) =>
                                  applyAnnotationsUpdate((prev) =>
                                    prev.map((p) =>
                                      p.id === ann.id
                                        ? {
                                            ...p,
                                            fontSize: parseInt(e.target.value),
                                          }
                                        : p,
                                    ),
                                  )
                                }
                              />
                            </div>
                          </>
                        )}

                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                            Color
                          </Label>
                          <div className="flex gap-2 mt-1">
                            {COLORS.map((c) => (
                              <button
                                key={c}
                                disabled={!canEdit}
                                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed ${ann.color === c ? "border-primary" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                                onClick={() =>
                                  applyAnnotationsUpdate((prev) =>
                                    prev.map((p) =>
                                      p.id === ann.id ? { ...p, color: c } : p,
                                    ),
                                  )
                                }
                              />
                            ))}
                          </div>
                        </div>

                        {ann.type === "text" && (
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                              Background
                            </Label>
                            <div className="flex gap-2 mt-1">
                              <button
                                disabled={!canEdit}
                                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed ${ann.backgroundColor === "transparent" ? "border-primary" : "border-border"}`}
                                style={{
                                  backgroundImage:
                                    "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                                  backgroundSize: "10px 10px",
                                  backgroundPosition:
                                    "0 0, 0 5px, 5px -5px, -5px 0",
                                }}
                                onClick={() =>
                                  applyAnnotationsUpdate((prev) =>
                                    prev.map((p) =>
                                      p.id === ann.id
                                        ? {
                                            ...p,
                                            backgroundColor: "transparent",
                                          }
                                        : p,
                                    ),
                                  )
                                }
                                title="Transparent"
                              />
                              {[
                                "#00000080",
                                "#ffffff80",
                                "#ef444480",
                                "#3b82f680",
                              ].map((c) => (
                                <button
                                  key={c}
                                  disabled={!canEdit}
                                  className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed ${ann.backgroundColor === c ? "border-primary" : "border-transparent"}`}
                                  style={{ backgroundColor: c }}
                                  onClick={() =>
                                    applyAnnotationsUpdate((prev) =>
                                      prev.map((p) =>
                                        p.id === ann.id
                                          ? { ...p, backgroundColor: c }
                                          : p,
                                      ),
                                    )
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-4 border-t border-border mt-4">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            disabled={!canEdit}
                            onClick={() => {
                              deleteAnnotation.mutate(ann.id);
                              setSelectedAnnotationId(null);
                            }}
                          >
                            Delete Annotation
                          </Button>
                        </div>
                      </div>
                    );
                  })()
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
