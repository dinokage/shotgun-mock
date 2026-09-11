import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type ApprovalEvent } from "@/data/mockData";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  CheckCircle2,
  MessageSquare,
  XCircle,
  ChevronLeft,
  ChevronRight,
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
import { Link, useSearch, useRoute } from "wouter";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, copyToClipboard } from "@/lib/utils";
import { cut } from "@/lib/motion";
// The seeded-placeholder imports that used to live here are gone with the
// last of this page's invented content: the fake v001/v002/v003 compare list,
// the two hardcoded "Previous/Next Shot" cards, and the generated poster
// frames. Everything the player shows now comes from a real uploaded version.
import { useAuthStore } from "@/store/auth";
import { useTasksStore } from "@/store/tasks";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useShotStore } from "@/store/shots";
import { useAssetStore } from "@/store/assets";
import {
  getShotId,
  getAssetId,
  canApproveAsProductionManager,
} from "@/lib/taskShape";
import {
  useUpdateTask,
  useAddTaskApprovalEvent,
  useTaskApprovalEvents,
} from "@/hooks/useTasks";
import {
  usePresentationValue,
  useStartPresentation,
  useStopPresentation,
  usePushPresenterFrame,
  useReviewComments,
  usePostReviewComment,
  useUploadReviewAudio,
  useClientNotes,
  useTransferClientNote,
  type ReviewCommentDTO,
} from "@/hooks/useReviewSession";
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
  isTempAnnotationId,
} from "@/hooks/useReviews";
import { useVersions, useCreateVersion, useUpdateVersion } from "@/hooks/useVersions";
import { useUploadVideo } from "@/hooks/useUploads";
import { useCreateClientAccessLink } from "@/hooks/useClientAccess";

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

/**
 * The project's frame rate.
 *
 * Named rather than left as the literal 24 it was scattered across the
 * playback engine, the scrub-sync effect and the frame/seconds conversions --
 * three places that have to agree, and silently produced drift when they
 * did not. 24 is the studio's delivery rate; a per-project rate would live on
 * the project record, and this is the single place that would read it.
 */
const PROJECT_FPS = 24;

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
  "submitted-for-manager-review": "submitted for Production Manager review",
  "submitted-for-producer-review": "submitted for Main Producer review",
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
 * below) — not a decorative placeholder. `audioUrl` points at a real uploaded
 * file served by the API, so playback survives a reload and works on every
 * reviewer's machine; `onError` still degrades gracefully if the file itself
 * can't be fetched.
 */
function VoiceNotePlayer({ comment }: { comment: ReviewCommentDTO }) {
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
        Voice note unavailable
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

  // Multi-tier approval chain (Artist -> Lead/Supervisor -> Producer) is real,
  // persisted state on the task backing this version — not local UI state —
  // so it survives reload/navigation and stays in sync with every other view
  // of the same task (Kanban, task drawer, dashboards). ftrack only tracks a
  // single status field per version; this is a genuine multi-step chain with
  // a full audit trail.
  const [, routeParams] = useRoute("/review/:taskId");
  const taskId = routeParams?.taskId;
  const tasks = useTasksStore((s) => s.tasks);
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const liveShotsForApproval = useShotStore((s) => s.shots);
  const updateShotStatus = useShotStore((s) => s.updateShot);
  const updateTaskMutation = useUpdateTask();
  const reviewedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  const addApprovalEventMutation = useAddTaskApprovalEvent(reviewedTask?.id);
  const { data: approvalEvents = [] } = useTaskApprovalEvents(reviewedTask?.id);
  const reviewedTaskShotId = reviewedTask ? getShotId(reviewedTask) : undefined;
  const reviewedTaskAssetId = reviewedTask ? getAssetId(reviewedTask) : undefined;
  const reviewedShot = reviewedTaskShotId
    ? liveShotsForApproval.find((s) => s.id === reviewedTaskShotId)
    : undefined;
  const liveAssetsForApproval = useAssetStore((s) => s.assets);
  const reviewedAsset = reviewedTaskAssetId
    ? liveAssetsForApproval.find((a) => a.id === reviewedTaskAssetId)
    : undefined;

  // The version this page's annotations/approval chain attach to. One real
  // Version row per task, created on first visit if the task doesn't have
  // one yet (no real render pipeline exists, so there's nothing meaningful
  // to fill mediaUrl with until someone inserts real footage -- see the
  // "insert video" flow below, which patches this same version's src in
  // place rather than creating a second one).
  const versionEntityId = reviewedTaskShotId ?? reviewedTaskAssetId;
  const versionEntityType: "shot" | "asset" | undefined = reviewedTaskShotId
    ? "shot"
    : reviewedTaskAssetId
      ? "asset"
      : undefined;
  const { data: taskVersions = [], isLoading: versionsLoading } = useVersions(
    versionEntityId,
    versionEntityType,
  );
  const existingVersion = taskId
    ? taskVersions.find((v) => v.taskId === taskId)
    : undefined;
  const createVersion = useCreateVersion();
  const versionCreateAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!taskId || !versionEntityId || !versionEntityType) return;
    if (versionsLoading) return;
    if (existingVersion) return;
    if (versionCreateAttempted.current === taskId) return;
    versionCreateAttempted.current = taskId;
    createVersion.mutate({
      entityId: versionEntityId,
      entityType: versionEntityType,
      versionNumber: reviewedShot?.currentVersion || reviewedAsset?.version || "v001",
      taskId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per taskId (guarded by versionCreateAttempted), not on every dependency change
  }, [taskId, versionEntityId, versionEntityType, versionsLoading, existingVersion]);
  const versionId = existingVersion?.id;
  const createClientAccessLink = useCreateClientAccessLink();
  const uploadVideo = useUploadVideo();
  const updateVersion = useUpdateVersion();
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");

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
  // The Lead-stage approval gate is department-scoped, mirroring
  // TaskDrawer.tsx: approve_reviews alone would let a Lead/Producer approve
  // another department's work. The Production Manager stage below is its
  // own separate gate (see getProductionManagerApprovers in taskShape.ts) —
  // production_head/admin deliberately don't get this first gate.
  const reviewedDept = departments.find(
    (d) => d.name === reviewedTask?.department,
  );
  // Only the department's own lead holds the first gate. The producer is a
  // single studio-wide role with its own final gate below, so it no longer
  // doubles as department leadership here.
  const canApproveAsLead = Boolean(
    currentUser &&
      canApproveReview &&
      currentUser.role === "lead" &&
      currentUser.departmentId === reviewedDept?.id,
  );
  const canApproveAsPM = Boolean(
    currentUser &&
      currentUser.role === "production_head" &&
      canApproveAsProductionManager(
        currentUser.id,
        reviewedTask?.department,
        users,
        departments,
      ),
  );
  // The main producer is studio-wide, so unlike the Lead and Production
  // Manager gates above this one carries no department check — they are the
  // single final sign-off before a shot reaches the client.
  const canApproveAsProducer = Boolean(
    currentUser && canApproveReview && currentUser.role === "producer",
  );
  // Presentation Mode: a Lead/Producer broadcasts their playhead to everyone
  // else viewing this version — the internal page and the client portal, on
  // their own machines. The presentation row lives server-side and is polled
  // fast only while a session is actually running (see usePresentation).
  const presentation = usePresentationValue(versionId);
  const startPresentation = useStartPresentation(versionId);
  const stopPresentation = useStopPresentation(versionId);
  const pushPresenterFrame = usePushPresenterFrame(versionId);
  const isPresenting =
    presentation.isActive && presentation.presenterId === currentUser?.id;
  const isLockedViewer =
    presentation.isActive &&
    presentation.versionId === versionId &&
    presentation.presenterId !== currentUser?.id;

  const [isPlaying, setIsPlaying] = useState(false);
  // Signed shuttle speed, as J/K/L behave in every editing application:
  // negative reverses, magnitude is the multiplier, and repeated presses step
  // through the speeds rather than toggling. Kept separate from isPlaying so
  // that pausing and resuming does not lose the speed you were shuttling at.
  const [playbackRate, setPlaybackRate] = useState(1);
  const SHUTTLE_SPEEDS = [1, 2, 4, 8];

  // L: forward, faster each press. J: reverse, faster each press.
  const shuttle = (direction: 1 | -1) => {
    setPlaybackRate((rate) => {
      const goingSameWay = isPlaying && Math.sign(rate) === direction;
      const current = Math.abs(rate);
      const next = goingSameWay
        ? SHUTTLE_SPEEDS[
            Math.min(SHUTTLE_SPEEDS.indexOf(current) + 1, SHUTTLE_SPEEDS.length - 1)
          ]
        : 1;
      return next * direction;
    });
    setIsPlaying(true);
  };

  const [frame, setFrame] = useState(1);

  // The clip's real length, in frames.
  //
  // This was hardcoded to 240 -- exactly ten seconds at 24fps. Any footage
  // longer than that was simply unreachable: the scrubber ended, playback
  // looped, and stepping frame by frame stopped, all in the middle of the
  // shot. Anything shorter left the last stretch of the timeline scrubbing
  // past the end of the video. Now it follows the media, with 240 kept only
  // as the pre-load default so the timeline has a sane width before the
  // metadata arrives.
  const [mediaDurationSec, setMediaDurationSec] = useState<number | null>(null);
  const maxFrames = mediaDurationSec
    ? Math.max(1, Math.round(mediaDurationSec * PROJECT_FPS))
    : 240;

  // In/out points. Null means "no range set"; when both are set, playback
  // loops between them, which is how anyone actually studies a few frames of
  // an animation rather than rewinding the whole shot each pass.
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [videoClips, setVideoClips] = useState<MediaClip[]>([
    {
      id: "base-v1",
      // Resolved asynchronously below (this office network has no internet
      // access, so a hardcoded CDN URL here would just be a broken player
      // for every real user) -- empty until the self-hosted placeholder
      // clip finishes generating.
      src: "",
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
  // Drawing is a write, and the server enforces `submit_reviews` on every
  // annotation route. Leaving that out of `canEdit` meant the whole drawing
  // toolbar was offered to roles whose every stroke came back 403 -- the
  // admin above all, who is the account most likely to be exploring. The
  // tools now read as unavailable rather than broken.
  const canEdit = !viewerMode && !isLockedViewer && canSubmitReview;
  // Comments (including voice notes) are server-backed and keyed to this
  // version, so every reviewer on the same version sees the same stream.
  const { data: comments = [] } = useReviewComments(versionId);
  const postComment = usePostReviewComment(versionId);
  const uploadReviewAudio = useUploadReviewAudio();
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
  // being reviewed (versionId, resolved above from this task's real Version
  // row — the same id already used above for Presentation Mode syncing).
  const { data: annotations = [] } = useAnnotations(versionId);
  // A failed annotation write used to be completely silent: the mark was
  // pushed up, the server refused it, and the drawing simply disappeared with
  // no explanation at all. Both real refusals have a specific cause worth
  // naming -- the role has no submit_reviews capability (403), or the shot is
  // not in this person's visibility scope (404) -- and guessing between them
  // is not something a reviewer should have to do.
  const reportAnnotationFailure = (message: string) => {
    const lower = message.toLowerCase();
    const isForbidden =
      lower.includes("forbidden") || lower.includes("permission") || lower.includes("403");
    const isNotFound = lower.includes("not found") || lower.includes("404");
    toast({
      title: "Annotation not saved",
      description: isForbidden
        ? "Your role can view this review but not draw on it. Annotating needs the Submit Reviews permission — a lead or producer can grant it."
        : isNotFound
          ? "This shot isn't assigned to you, so you can't annotate it. Ask your lead to assign the task to you first."
          : `Couldn't save that mark: ${message}`,
      variant: "destructive",
    });
  };
  const createAnnotation = useCreateAnnotation(versionId, reportAnnotationFailure);
  const updateAnnotation = useUpdateAnnotation(versionId, reportAnnotationFailure);
  const deleteAnnotation = useDeleteAnnotation(versionId, reportAnnotationFailure);
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
        // A row still carrying its optimistic placeholder id has no server
        // row to address yet, so a PUT against it would 404 and roll the
        // edit back. The create still in flight will land the current state;
        // skipping here is what makes "draw, then immediately nudge it"
        // behave instead of appearing to undo itself.
        if (isTempAnnotationId(a.id)) return;
        const { id, ...rest } = a;
        updateAnnotation.mutate({ id, ...rest });
      }
    });
    prevList
      .filter((a) => !nextIds.has(a.id))
      // Same reasoning in reverse: there is nothing on the server to delete.
      .filter((a) => !isTempAnnotationId(a.id))
      .forEach((a) => deleteAnnotation.mutate(a.id));
  };
  // Save feedback for the annotation layer. There is no Save button here by
  // design -- marks persist as they are drawn -- but "it saved itself" is a
  // claim the interface has to actually make, or the artist has no way to
  // know their notes will still be there when the lead opens the shot.
  const annotationWriteInFlight =
    createAnnotation.isPending ||
    updateAnnotation.isPending ||
    deleteAnnotation.isPending;
  const [annotationSaveState, setAnnotationSaveState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  useEffect(() => {
    if (annotationWriteInFlight) {
      setAnnotationSaveState("saving");
      return;
    }
    // Only advance to "saved" from "saving": this effect also runs on mount,
    // and flashing "Saved" at someone who has not drawn anything is a claim
    // about work that does not exist.
    setAnnotationSaveState((prev) => (prev === "saving" ? "saved" : prev));
  }, [annotationWriteInFlight]);
  useEffect(() => {
    if (annotationSaveState !== "saved") return;
    const timer = window.setTimeout(() => setAnnotationSaveState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [annotationSaveState]);

  const [resizing, setResizing] = useState<{
    id: string;
    type: "video" | "annotation";
    edge: "start" | "end";
  } | null>(null);
  const [draggingElement, setDraggingElement] =
    useState<DraggingElement | null>(null);
  // Local-only preview of an in-progress annotation drag/resize. The old
  // code called applyAnnotationsUpdate -- a real server mutation -- on
  // every single mousemove tick, so a drag of even a few dozen pixels fired
  // dozens of concurrent PUT requests; whichever response happened to land
  // last "won", which was often NOT the final drop position (out-of-order
  // network responses), making edits appear to snap back instead of
  // staying where the user actually released them. Now the drag only
  // updates this local preview (merged into what's rendered below) and the
  // real update is sent exactly once, in the corresponding mouseup.
  const [annotationPreview, setAnnotationPreview] = useState<{
    id: string;
    patch: Partial<Annotation>;
  } | null>(null);
  const displayAnnotations = useMemo(
    () =>
      annotationPreview
        ? annotations.map((a) =>
            a.id === annotationPreview.id ? { ...a, ...annotationPreview.patch } : a,
          )
        : annotations,
    [annotations, annotationPreview],
  );

  const [abWipe, setAbWipe] = useState(false);
  const [abWipePosition, setAbWipePosition] = useState(50);
  const [isDraggingWipe, setIsDraggingWipe] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [ghosting, setGhosting] = useState(false);

  // Version Comparison State
  const [compareMode, setCompareMode] = useState<
    "off" | "side-by-side" | "overlay"
  >("off");
  const [compareVersionA, setCompareVersionA] = useState("");
  const [compareVersionB, setCompareVersionB] = useState("");
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const compareVideoRefA = useRef<HTMLVideoElement>(null);
  const compareVideoRefB = useRef<HTMLVideoElement>(null);

  // The versions this shot actually has, for the compare dropdowns. This used
  // to be a hardcoded list of three invented versions ("v001 — Initial
  // Layout", ...) with generated placeholder footage behind them, so Compare
  // always looked functional and never once compared the studio's real work.
  // Only versions with uploaded media appear: comparing against a row that
  // has no file is a blank pane, not a comparison.
  const VERSIONS = useMemo(
    () =>
      taskVersions
        .filter((v) => v.mediaUrl)
        .map((v) => ({
          id: v.id,
          label: v.notes ? `${v.versionNumber} — ${v.notes}` : v.versionNumber,
          src: v.mediaUrl,
        })),
    [taskVersions],
  );

  // The base clip spans the whole timeline, so its end has to follow the real
  // frame count. Without this it stayed at whatever maxFrames was when the
  // clip was created (240), and every frame past that fell outside the clip's
  // active span -- the video vanished partway through its own shot.
  useEffect(() => {
    setVideoClips((prev) =>
      prev.map((c) =>
        c.id === "base-v1" && c.endFrame !== maxFrames
          ? { ...c, endFrame: maxFrames }
          : c,
      ),
    );
  }, [maxFrames]);

  // Default the two sides to the newest pair once real versions arrive.
  // Seeded rather than left empty so opening Compare shows a comparison
  // immediately instead of two empty selects.
  useEffect(() => {
    if (VERSIONS.length === 0) return;
    setCompareVersionA((cur) =>
      VERSIONS.some((v) => v.id === cur) ? cur : VERSIONS[VERSIONS.length - 1].id,
    );
    setCompareVersionB((cur) =>
      VERSIONS.some((v) => v.id === cur) ? cur : VERSIONS[0].id,
    );
  }, [VERSIONS]);

  // Loads the version's real, persisted footage (uploaded via /uploads/video
  // and saved to the version's mediaUrl) into the player -- without this,
  // "Insert Video" only ever updated this component's own local state, so
  // the artist who uploaded it was the only person who could ever see it:
  // reloading the page, or a Lead/Production Manager opening the exact same
  // review, saw "No footage uploaded yet" regardless of what was actually
  // uploaded. Only overwrites the clip when it doesn't already show this
  // exact media, so it doesn't fight an upload still in flight in this tab.
  useEffect(() => {
    if (!existingVersion?.mediaUrl) return;
    setVideoClips((prev) =>
      prev.map((c) => {
        if (c.id !== "base-v1" || c.src === existingVersion.mediaUrl) return c;
        // Replacing a locally-previewed blob: with the now-persisted real
        // URL -- release it so the upload flow above doesn't leak one blob
        // per insert.
        if (c.src.startsWith("blob:")) URL.revokeObjectURL(c.src);
        return { ...c, src: existingVersion.mediaUrl, name: "Main Sequence" };
      }),
    );
    // Re-run whenever the persisted mediaUrl changes -- on initial load
    // (versions query resolves after mount), after this tab's own upload
    // completes, and when the 10s fetchMe poll (App.tsx) picks up another
    // user's upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingVersion?.mediaUrl]);

  const reviewWorkflowStatus:
    | "wip"
    | "lead-review"
    | "pm-review"
    | "producer-review"
    | "approved" =
    reviewedTask?.status === "review" || reviewedTask?.status === "lead-review"
      ? "lead-review"
      : reviewedTask?.status === "pm-review" ||
          reviewedTask?.status === "producer-review" ||
          reviewedTask?.status === "approved"
        ? reviewedTask.status
        : "wip";
  const submitApproval = (
    status:
      | "in-progress"
      | "lead-review"
      | "pm-review"
      | "producer-review"
      | "approved",
    action: ApprovalEvent["action"],
  ) => {
    if (!currentUser || !taskId) return;
    // Real, persisted mutations (not the legacy local-store approval path,
    // which only synced status via a fire-and-forget PUT and kept its
    // approval-event history in local-only state) — this is the same pair
    // of calls TaskDrawer.tsx's approve/reject actions use, so a task's
    // status and audit trail agree no matter which surface it was actioned
    // from, and other open views (Kanban, task drawer, dashboards) refetch
    // via the shared "tasks" query cache instead of going stale.
    updateTaskMutation.mutate({ id: taskId, status });
    addApprovalEventMutation.mutate({ action });
    // The final Production Manager sign-off is what actually forwards a
    // linked shot into the client-facing review queue — client-review.tsx
    // filters shots on exactly this status, same as TaskDrawer.tsx's
    // equivalent action.
    if (action === "published" && reviewedShot) {
      updateShotStatus(reviewedShot.id, { status: "client-review" });
    }
    // The real, cross-user notification for this event is already sent
    // server-side (routes/tasks.ts's POST /:id/approval-events handler,
    // via createNotification) to whoever needs to act next -- a local
    // addNotification() call here used to write into store/notifications.ts,
    // a per-browser-only store nothing else reads from anymore.
  };

  // Client feedback moderation: notes a client leaves in the client portal
  // land in a holding area here rather than the shared comment stream — an
  // internal reviewer has to explicitly "transfer" a note before it becomes
  // visible team-wide.
  const { data: clientNotes = [] } = useClientNotes(reviewedTaskShotId);
  const transferClientNote = useTransferClientNote(reviewedTaskShotId, versionId);
  const pendingClientNotes = clientNotes.filter((n) => !n.transferred);

  const { toast } = useToast();

  // Remembered per browser, same reasoning as the sidebar's collapse: how
  // much of the screen you want given to the image rather than the notes
  // about it depends on the monitor you are sitting at, not on who you are.
  const [commentsCollapsed, setCommentsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("forge-review-comments-collapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        "forge-review-comments-collapsed",
        commentsCollapsed ? "1" : "0",
      );
    } catch {
      // Private window or blocked storage: the preference simply won't stick.
    }
  }, [commentsCollapsed]);

  // Set when the browser cannot decode the loaded file. Surfaced rather than
  // logged, because the failure is invisible otherwise: the upload succeeded,
  // the player is there, and the frame is simply black forever.
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoCanvasContainerRef = useRef<HTMLDivElement>(null);

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
      Space: () => {
        if (isLockedViewer) return;
        // Space resumes at normal speed rather than whatever shuttle rate was
        // last used -- pressing play after shuttling at 8x and getting 8x is
        // never what anyone means.
        setIsPlaying((p) => {
          if (!p) setPlaybackRate(1);
          return !p;
        });
      },
      // J / K / L: the transport every editor and review tool shares.
      j: () => !isLockedViewer && shuttle(-1),
      k: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setPlaybackRate(1);
      },
      l: () => !isLockedViewer && shuttle(1),
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
      // Comma and full stop step one frame on any keyboard layout where the
      // arrow keys are awkward to reach from the annotation tools.
      ",": () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame((f) => Math.max(1, f - 1));
      },
      ".": () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame((f) => Math.min(maxFrames, f + 1));
      },
      Home: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame(1);
      },
      End: () => {
        if (isLockedViewer) return;
        setIsPlaying(false);
        setFrame(maxFrames);
      },
      // In and out points. `i`/`o` are the bindings every editor uses; `[`
      // and `]` are kept as the aliases some colourists reach for. These were
      // empty placeholder functions -- the keys were bound and did nothing,
      // which is worse than being unbound, because the player looked like it
      // had ignored the press.
      i: () => !isLockedViewer && setInPoint(frame),
      o: () => !isLockedViewer && setOutPoint(frame),
      "[": () => !isLockedViewer && setInPoint(frame),
      "]": () => !isLockedViewer && setOutPoint(frame),
      // Clears the range, as in most players.
      x: () => {
        if (isLockedViewer) return;
        setInPoint(null);
        setOutPoint(null);
      },
      f: () => {
        const el = videoCanvasContainerRef.current;
        if (!el) return;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else el.requestFullscreen().catch(() => {});
      },
      Escape: () => {
        setSelectedAnnotationId(null);
        setTool("select");
      },
      // Delete removes the selected mark. Backspace deliberately does NOT:
      // an annotation is a reviewer's note with no undo behind it, and
      // Backspace is the key people hit reflexively to go back or to correct
      // a typo after focus has moved off a field. One stray press silently
      // destroying somebody's review notes is not a trade worth the
      // convenience -- Delete alone is unambiguous.
      Delete: () => {
        if (!canEdit) return;
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
    [selectedAnnotationId, maxFrames, isLockedViewer, viewerMode, isPlaying, frame],
  );

  // Push our playhead out to locked viewers whenever we're presenting.
  // Coalesced on a short timer: dragging the scrubber changes `frame` on
  // every pixel, and one POST per pixel would both flood the API and let
  // out-of-order responses land a stale frame on every viewer.
  useEffect(() => {
    if (!isPresenting) return;
    const timer = window.setTimeout(() => pushPresenterFrame.mutate(frame), 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, isPresenting]);

  // While locked to a presenter, mirror their playhead and give up local playback.
  useEffect(() => {
    if (!isLockedViewer) return;
    setIsPlaying(false);
    setFrame(presentation.frame);
  }, [isLockedViewer, presentation.frame]);

  // Don't leave the room "presenting" after navigating away. Both the flag
  // and the mutation are read through refs: the effect must run exactly once
  // (its cleanup is the unmount), but at first render `versionId` is still
  // resolving, so a mutation captured then would post at "undefined".
  const isPresentingRef = useRef(false);
  isPresentingRef.current = isPresenting;
  const stopPresentationRef = useRef(stopPresentation);
  stopPresentationRef.current = stopPresentation;
  useEffect(() => {
    return () => {
      if (isPresentingRef.current) stopPresentationRef.current.mutate();
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
        const a = displayAnnotations.find((x) => x.id === resizing.id);
        if (!a) return;
        const currentStart = a.startFrame ?? a.frame;
        const currentEnd = a.endFrame ?? Math.min(maxFrames, a.frame + 60);
        const patch =
          resizing.edge === "start"
            ? { startFrame: Math.min(hoveredFrame, currentEnd - 1) }
            : { endFrame: Math.max(hoveredFrame, currentStart + 1) };
        setAnnotationPreview({ id: resizing.id, patch });
      }
    };

    const handleMouseUp = () => {
      setResizing((current) => {
        if (current && current.type !== "video") {
          setAnnotationPreview((preview) => {
            if (preview && preview.id === current.id) {
              applyAnnotationsUpdate((prev) =>
                prev.map((a) => (a.id === preview.id ? { ...a, ...preview.patch } : a)),
              );
            }
            return null;
          });
        }
        return null;
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, maxFrames, displayAnnotations]);

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
        setAnnotationPreview({
          id: draggingElement.id,
          patch: {
            x: draggingElement.initialX + dx,
            y: draggingElement.initialY + dy,
          },
        });
      }
    };

    const handleMouseUp = () => {
      setDraggingElement((current) => {
        if (current && current.type !== "video") {
          setAnnotationPreview((preview) => {
            if (preview && preview.id === current.id) {
              applyAnnotationsUpdate((prev) =>
                prev.map((a) => (a.id === preview.id ? { ...a, ...preview.patch } : a)),
              );
            }
            return null;
          });
        }
        return null;
      });
    };
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
      // Reverse is driven entirely by seeking, because HTML video cannot play
      // backwards: setting a negative playbackRate is ignored by every
      // browser. Forward playback lets the element play itself (smoother, and
      // it keeps audio) with the frame counter following along.
      const reverse = playbackRate < 0;
      const speed = Math.abs(playbackRate);

      videoRefs.current.forEach((v, id) => {
        const clip = videoClips.find((c) => c.id === id);
        if (clip && frame >= clip.startFrame && frame <= clip.endFrame) {
          v.currentTime = (frame - clip.startFrame) / PROJECT_FPS;
          if (reverse) {
            v.pause();
          } else {
            v.playbackRate = speed;
            v.play().catch((e) => console.log("Playback error:", e));
          }
        }
      });

      const updateFrame = () => {
        const now = Date.now();
        const dt = now - lastTime;
        // One frame every 1/24s at 1x, proportionally sooner as speed rises.
        if (dt >= 1000 / (PROJECT_FPS * speed)) {
          setFrame((f) => {
            // Play bounds. With an in/out range set, playback loops inside it
            // rather than over the whole shot -- the point of marking a range
            // is to watch those frames repeatedly.
            const loopStart = inPoint ?? 1;
            const loopEnd = outPoint ?? maxFrames;
            let nextF = reverse ? f - 1 : f + 1;
            if (reverse) {
              if (nextF < loopStart) nextF = loopEnd;
              videoRefs.current.forEach((v, id) => {
                const clip = videoClips.find((c) => c.id === id);
                if (clip && nextF >= clip.startFrame && nextF <= clip.endFrame) {
                  v.currentTime = (nextF - clip.startFrame) / PROJECT_FPS;
                }
              });
              lastTime = now;
              return nextF;
            }
            if (nextF > loopEnd) {
              nextF = loopStart; // loop back
              // Force seek on all videos
              videoRefs.current.forEach((v, id) => {
                const clip = videoClips.find((c) => c.id === id);
                if (
                  clip &&
                  nextF >= clip.startFrame &&
                  nextF <= clip.endFrame
                ) {
                  v.currentTime = (nextF - clip.startFrame) / PROJECT_FPS;
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
    // Deliberately excludes `frame`: the loop drives it through functional
    // state updates, and depending on it here would tear the loop down and
    // rebuild it on every single frame.
  }, [isPlaying, playbackRate, videoClips, inPoint, outPoint, maxFrames]);

  // Sync videos to frame when scrubbing (paused)
  useEffect(() => {
    if (!isPlaying) {
      videoRefs.current.forEach((v, id) => {
        const clip = videoClips.find((c) => c.id === id);
        if (clip && frame >= clip.startFrame && frame <= clip.endFrame) {
          v.currentTime = (frame - clip.startFrame) / PROJECT_FPS;
        }
      });
    }
  }, [frame, isPlaying, videoClips]);

  const handleSubmitComment = (audioUrl?: string, waveform?: number[]) => {
    const text = commentDraft.trim();
    if (!text && !audioUrl) return;
    postComment.mutate(
      { frame, text, audioUrl, waveform },
      {
        onSuccess: () => {
          setCommentDraft("");
          toast({
            description: audioUrl
              ? `Voice note added at frame ${frame}.`
              : `Comment added at frame ${frame}.`,
          });
        },
        onError: (err) => {
          toast({
            title: "Couldn't post comment",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
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
        // Upload first: a MediaRecorder blob: URL is scoped to this tab and
        // is dead after a reload, so a comment carrying one would play back
        // for nobody but the person who recorded it — and only until they
        // refreshed.
        uploadReviewAudio.mutate(blob, {
          onSuccess: ({ url }) =>
            handleSubmitComment(url, waveform.length ? waveform : undefined),
          onError: (err) =>
            toast({
              title: "Voice note upload failed",
              description:
                err instanceof Error ? err.message : "Please try again.",
              variant: "destructive",
            }),
        });
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
    : "Untitled Review";

  // Every hook above is called unconditionally regardless of which of these
  // branches fires -- only the render output is gated here, at the very end
  // of the component body.
  if (!taskId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Select a task to open its review.
      </div>
    );
  }
  if (!reviewedTask) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Task not found.
      </div>
    );
  }
  if (reviewedTaskAssetId && !reviewedShot) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground text-sm">
        <div>Asset review isn't supported in this player yet.</div>
        <div className="text-xs">Only shot-based tasks can be opened here.</div>
      </div>
    );
  }
  if (!reviewedShot) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        This task's shot could not be found.
      </div>
    );
  }

  return (
    // `h-full`, not `h-screen`. AppShell already spends 56px on the top bar
    // before this page is rendered into it, so a 100vh child was 56px taller
    // than its slot: the whole player scrolled, and the first thing to leave
    // the viewport was its own header -- the shot name, the Queue link and the
    // approval buttons. That is most of what made this page feel congested.
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between gap-4 px-4 shrink-0 overflow-hidden">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-8 w-8 text-muted-foreground shrink-0"
          >
            <Link href={`/shots/${reviewedShot.id}`}>
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
          {/* The player now opens by default on /review, so the queue needs
              its own way back. The query flag stops that landing from
              redirecting straight into a shot again. */}
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-8 text-xs text-muted-foreground shrink-0"
          >
            <Link href="/review?queue=1">Queue</Link>
          </Button>
          <div className="font-medium truncate" title={`FORGE REVIEW — ${versionLabel}`}>
            FORGE REVIEW — {versionLabel}
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
          {!isLockedViewer && canPresent && versionId && (
            <PresentationToggle
              isPresenting={isPresenting}
              onStart={() => {
                startPresentation.mutate(frame, {
                  onSuccess: () =>
                    toast({
                      title: "Presenting",
                      description:
                        "Your playhead is now synced to everyone viewing this version.",
                    }),
                  onError: (err) =>
                    toast({
                      title: "Couldn't start presenting",
                      description:
                        err instanceof Error
                          ? err.message
                          : "Please try again.",
                      variant: "destructive",
                    }),
                });
              }}
              onStop={() => {
                stopPresentation.mutate();
                toast({
                  title: "Presentation Ended",
                  description: "Viewers can scrub independently again.",
                });
              }}
            />
          )}
          {!viewerMode && isProd && versionId && (
            <Button
              size="sm"
              variant="outline"
              className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
              onClick={() => {
                setShareEmail("");
                setShareDialogOpen(true);
              }}
            >
              <Link2 className="w-4 h-4 mr-2" /> Share with Client
            </Button>
          )}
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Share with Client</DialogTitle>
                <DialogDescription>
                  Enter the client's email to send them the access code
                  automatically, or leave it blank to just copy the link and
                  code to share yourself.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="client-share-email">Client email (optional)</Label>
                <Input
                  id="client-share-email"
                  type="email"
                  placeholder="client@studio.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={createClientAccessLink.isPending || !versionId}
                  onClick={async () => {
                    if (!versionId) return;
                    try {
                      // Creates a new code, or returns the existing
                      // still-valid one for this version -- clicking this
                      // again to re-share doesn't mint (and confuse the
                      // client with) a second code.
                      const trimmedEmail = shareEmail.trim();
                      const link = await createClientAccessLink.mutateAsync({
                        versionId,
                        ...(trimmedEmail ? { clientEmail: trimmedEmail } : {}),
                      });
                      setShareDialogOpen(false);

                      if (trimmedEmail && link.emailSent) {
                        toast({
                          title: "Sent to Client",
                          description: `Access code ${link.code} emailed to ${trimmedEmail}.`,
                        });
                        return;
                      }

                      const shareText = `Forge client review link: ${window.location.origin}/client-review\nAccess code: ${link.code}`;
                      const copied = await copyToClipboard(shareText);
                      if (trimmedEmail && !link.emailSent) {
                        toast({
                          title: "Email Failed — Code Copied Instead",
                          description: copied
                            ? `Couldn't send the email, but the link and code ${link.code} are on your clipboard — share them manually.`
                            : `Couldn't send the email or copy to clipboard. Access code: ${link.code}`,
                          variant: "destructive",
                        });
                        return;
                      }
                      toast({
                        title: copied ? "Link & Code Copied" : "Code Generated",
                        description: copied
                          ? `Link and access code ${link.code} copied to clipboard — send both to the client.`
                          : `Access code: ${link.code} — copy failed, share this code manually along with the client review link.`,
                        variant: copied ? undefined : "destructive",
                      });
                    } catch {
                      toast({
                        title: "Couldn't Generate Link",
                        description: "Something went wrong creating the client access code.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  {shareEmail.trim() ? "Send Email" : "Copy Link"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                {canSubmitReview &&
                  reviewWorkflowStatus === "wip" &&
                  existingVersion?.mediaUrl && (
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
                {canApproveAsLead && reviewWorkflowStatus === "lead-review" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                      onClick={() => {
                        submitApproval(
                          "pm-review",
                          "submitted-for-manager-review",
                        );
                        toast({
                          title: "Sent to Production Manager",
                          description: "Awaiting final sign-off",
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
                {canApproveAsPM && reviewWorkflowStatus === "pm-review" && (
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
                        submitApproval("lead-review", "changes-requested");
                        toast({ title: "Sent Back to Lead" });
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" /> Send Back
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {canSubmitReview &&
                  reviewWorkflowStatus === "wip" &&
                  (existingVersion?.mediaUrl ? (
                    <>
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
                      {/* Straight to the main producer, skipping the lead
                          gate — for work the producer asked for directly, or
                          when the department has no lead available. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          submitApproval(
                            "producer-review",
                            "submitted-for-producer-review",
                          );
                          toast({
                            title: "Submitted",
                            description: "Submitted for Main Producer Review",
                          });
                        }}
                      >
                        <Send className="w-4 h-4 mr-2" /> Submit to Main
                        Producer
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Insert your footage above to submit for review
                    </span>
                  ))}

                {/* Lead/Supervisor can only act once the Artist has actually
                    submitted for Lead review — mirrors the Artist button's
                    own 'wip' gate above so the UI can't fabricate an
                    approval step that never happened. Gated to the reviewed
                    task's own department (canApproveAsLead), matching
                    TaskDrawer.tsx. Approving here hands off to the
                    department's Production Manager for final sign-off — see
                    the pm-review block below — it no longer publishes
                    straight to production. */}
                {canApproveAsLead && reviewWorkflowStatus === "lead-review" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                      onClick={() => {
                        submitApproval(
                          "pm-review",
                          "submitted-for-manager-review",
                        );
                        toast({
                          title: "Sent to Production Manager",
                          description:
                            "Approved by Lead — awaiting final sign-off",
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

                {/* Production Manager's final sign-off — the last gate before
                    a linked shot is forwarded into the client-facing review
                    queue. Gated to the department's own production_head,
                    falling back to the studio's overall Production
                    Management production_head(s), falling back to any
                    production_head — see canApproveAsPM above /
                    getProductionManagerApprovers in lib/taskShape.ts. */}
                {canApproveAsPM && reviewWorkflowStatus === "pm-review" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                      onClick={() => {
                        submitApproval(
                          "producer-review",
                          "submitted-for-producer-review",
                        );
                        toast({
                          title: "Sent to Main Producer",
                          description:
                            "Approved by Production — awaiting final sign-off",
                        });
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve &
                      Send to Producer
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#B5651D] hover:bg-[#B5651D]/90 text-white"
                      onClick={() => {
                        submitApproval("lead-review", "changes-requested");
                        toast({
                          title: "Sent Back to Lead",
                          description:
                            "Needs another look before it can move on",
                        });
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" /> Send Back
                      to Lead
                    </Button>
                  </>
                )}

                {/* The main producer's final gate. Publishing here is what
                    forwards the shot into the client-facing review queue —
                    client-review.tsx filters shots on exactly that status. */}
                {canApproveAsProducer &&
                  reviewWorkflowStatus === "producer-review" && (
                    <>
                      <Button
                        size="sm"
                        className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                        onClick={() => {
                          submitApproval("approved", "published");
                          toast({
                            title: "Published",
                            description: "Approved & sent to the client",
                          });
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Approve &
                        Publish to Client
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#B5651D] hover:bg-[#B5651D]/90 text-white"
                        onClick={() => {
                          submitApproval("pm-review", "changes-requested");
                          toast({ title: "Sent Back to Production" });
                        }}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" /> Send Back
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
          comments={comments}
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
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Player */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-black relative">
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
                    // .mov is listed explicitly because Windows does not
                    // always report a MIME type for it, so a bare "video/*"
                    // filter greys out QuickTime files the browser could in
                    // fact play. Whether it plays depends on the codec inside,
                    // not the extension -- see the check in onChange.
                    accept="video/*,.mov,.mp4,.webm,.m4v"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      // Reset so choosing the same file again still fires
                      // onChange (the input's value doesn't change otherwise).
                      e.target.value = "";
                      if (!file) return;
                      if (!versionId) {
                        toast({
                          title: "Not Ready Yet",
                          description:
                            "Still setting up this review — try again in a moment.",
                          variant: "destructive",
                        });
                        return;
                      }

                      // Formats no browser can decode, caught before the
                      // upload rather than after. EXR is the important one:
                      // it is what comes out of every renderer here, so it is
                      // the file people will naturally reach for, and there is
                      // no honest way to show it in a web player -- decoding
                      // half-float scanline OpenEXR and tone-mapping it is a
                      // transcode step, not a codec the browser has. Saying so
                      // plainly beats accepting the file and showing black.
                      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                      const UNPLAYABLE: Record<string, string> = {
                        exr: "OpenEXR is a linear high-dynamic-range render format — browsers have no decoder for it, and showing it needs a tone-mapped transcode first.",
                        dpx: "DPX is a film scan format with no browser decoder.",
                        tif: "TIFF sequences can't be played back in a browser.",
                        tiff: "TIFF sequences can't be played back in a browser.",
                        ari: "ARRIRAW has no browser decoder.",
                        r3d: "REDCODE RAW has no browser decoder.",
                        braw: "Blackmagic RAW has no browser decoder.",
                      };
                      if (UNPLAYABLE[ext]) {
                        toast({
                          title: `Can't review a .${ext} here`,
                          description: `${UNPLAYABLE[ext]} Export an H.264 MP4 review copy from your DCC and upload that — keep the ${ext.toUpperCase()} as the master.`,
                          variant: "destructive",
                        });
                        return;
                      }

                      // A .mov may hold H.264 (plays) or ProRes/DNxHD (does
                      // not). Only the browser can say, so ask it rather than
                      // guessing from the extension in either direction.
                      if (ext === "mov") {
                        const probe = document.createElement("video");
                        const verdict = probe.canPlayType("video/quicktime");
                        if (verdict === "") {
                          toast({
                            title: "This .mov may not play",
                            description:
                              "QuickTime files carrying ProRes or DNxHD can't be decoded in a browser. It will upload, but if the frame stays black, export an H.264 MP4 review copy instead.",
                          });
                        }
                      }

                      // A new file is a new clip: the old duration must not
                      // carry over, or the timeline keeps the previous shot's
                      // length until the new metadata happens to load.
                      setMediaDurationSec(null);
                      setPlaybackError(null);

                      // Show the file immediately via a local blob URL so
                      // scrubbing/playback feels instant, then swap to the
                      // real served URL once the upload finishes -- that
                      // real URL is what makes the footage visible to
                      // everyone else (lead, PM, client), not just this tab.
                      videoClips.forEach((c) => {
                        if (c.src.startsWith("blob:")) URL.revokeObjectURL(c.src);
                      });
                      setVideoClips([
                        {
                          id: "base-v1",
                          src: URL.createObjectURL(file),
                          trackIndex: 0,
                          startFrame: 1,
                          endFrame: maxFrames,
                          opacity: 100,
                          blendMode: "normal",
                          name: file.name,
                          x: 0,
                          y: 0,
                          scale: 1,
                        },
                      ]);
                      setFrame(1);

                      setIsUploadingVideo(true);
                      try {
                        const uploaded = await uploadVideo.mutateAsync(file);
                        await updateVersion.mutateAsync({
                          id: versionId,
                          mediaUrl: uploaded.url,
                        });
                        toast({
                          title: "Video Inserted",
                          description: `Now reviewing "${file.name}". Visible to the whole team.`,
                        });
                      } catch {
                        toast({
                          title: "Upload Failed",
                          description:
                            "The video is only visible in this tab until upload succeeds — try inserting it again.",
                          variant: "destructive",
                        });
                      } finally {
                        setIsUploadingVideo(false);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Insert Video"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
                <div className="w-px h-5 bg-border mx-1" />
                <div
                  className={cn(
                    "flex items-center gap-3",
                    !canEdit && "opacity-40 pointer-events-none",
                  )}
                  title={
                    canEdit
                      ? undefined
                      : "Drawing needs the Submit Reviews permission"
                  }
                >
                  <AnnotationToolbar
                    tool={canEdit ? tool : "select"}
                    onToolChange={setTool}
                    color={color}
                    onColorChange={setColor}
                    colors={COLORS}
                  />
                </div>
                {/* Says so once, up front, rather than letting someone draw
                    six marks and discover from six toasts that none of them
                    could ever have been saved. */}
                {!canEdit && !viewerMode && !isLockedViewer && (
                  <span className="text-[10px] text-muted-foreground max-w-[9rem] leading-tight">
                    View only — drawing needs the Submit Reviews permission.
                  </span>
                )}
                {/* Annotations save themselves as you draw; without this the
                    only way to find out whether that worked was to reload. */}
                {canEdit && annotationSaveState !== "idle" && (
                  <span
                    className={cn(
                      "text-[10px] font-medium whitespace-nowrap",
                      annotationSaveState === "saving"
                        ? "text-muted-foreground"
                        : "text-emerald-500",
                    )}
                  >
                    {annotationSaveState === "saving" ? "Saving…" : "Saved"}
                  </span>
                )}
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
                  // Needs two versions with real media to compare anything.
                  // Previously this always enabled because the version list
                  // was invented; now it honestly reflects what this shot has.
                  disabled={VERSIONS.length < 2}
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
                    VERSIONS.length < 2
                      ? `Compare needs two uploaded versions — this shot has ${VERSIONS.length}`
                      : compareMode === "off"
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

            {/* `min-h-0` is load-bearing. A flex child defaults to
                min-height:auto, meaning it refuses to shrink below its
                content -- so the 16:9 box below could push this column taller
                than the screen, and the page scrolled: the annotation toolbar
                and the timeline both slid out of view, which is what made the
                player feel cramped and half-missing. */}
            <div className="flex-1 min-h-0 relative flex items-center justify-center p-2">
              <div
                ref={videoCanvasContainerRef}
                // Letterboxed rather than width-driven. `w-full aspect-video`
                // derived height from width alone, so on a wide window the
                // frame grew taller than the space it had. Sizing from the
                // height and capping the width keeps the whole 16:9 frame
                // visible at any window shape, which is the behaviour every
                // other review tool has.
                className="h-full max-h-full max-w-full aspect-video bg-muted/10 border border-border/20 shadow-2xl relative overflow-hidden"
              >
                {videoClips.map((clip) => {
                  const isActive =
                    frame >= clip.startFrame && frame <= clip.endFrame;
                  return (
                    <ContextMenu key={clip.id}>
                      <ContextMenuTrigger asChild>
                        {(() => {
                          // blob: URLs (both real uploads via
                          // URL.createObjectURL and generated placeholder
                          // clips) carry no file extension -- `isDCC` must
                          // not fall through to "no preview" for those, or
                          // every real video ever inserted here would
                          // render as an unplayable DCC-asset card instead
                          // of a video.
                          const isBlob = clip.src.startsWith("blob:");
                          const isLoading = !clip.src;
                          const ext = isBlob
                            ? ""
                            : clip.src.split(".").pop()?.toLowerCase();
                          const isVideo =
                            isBlob || ["mp4", "webm", "mov"].includes(ext || "");
                          const isImage =
                            !isBlob &&
                            ["png", "jpg", "jpeg", "gif", "webp"].includes(
                              ext || "",
                            );
                          const isDCC = !isLoading && !isVideo && !isImage;

                          if (isLoading) {
                            // Nothing has been uploaded for this version yet.
                            // An empty frame, not a generated "preview" image:
                            // a decorative gradient here reads as footage that
                            // failed to load rather than as work that has not
                            // been submitted, and the two call for opposite
                            // responses from whoever is looking.
                            return (
                              <div
                                className={`absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 bg-neutral-950 text-white/80 ${isActive ? "opacity-100" : "opacity-0 hidden"}`}
                                style={{ opacity: clip.opacity / 100 }}
                              >
                                <div className="bg-black/50 rounded-lg px-4 py-2 text-sm font-medium backdrop-blur-sm">
                                  No footage uploaded yet
                                  {canSubmitReview && !viewerMode
                                    ? " — insert your video to begin reviewing."
                                    : "."}
                                </div>
                                {canSubmitReview && !viewerMode && (
                                  <Button
                                    size="sm"
                                    disabled={isUploadingVideo}
                                    className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white pointer-events-auto"
                                    onClick={() => fileInputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {isUploadingVideo ? "Uploading..." : "Insert Video"}
                                  </Button>
                                )}
                              </div>
                            );
                          }

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
                              // The timeline follows the footage rather than a
                              // fixed 240-frame guess, so the real length has
                              // to be read off the element as soon as the
                              // browser knows it. Only the base clip sets it:
                              // overlay clips are composited on top of that
                              // span, they do not define it.
                              onLoadedMetadata={(e) => {
                                if (clip.id !== "base-v1") return;
                                const d = e.currentTarget.duration;
                                if (Number.isFinite(d) && d > 0) {
                                  setMediaDurationSec(d);
                                }
                              }}
                              // A codec the browser cannot decode fails
                              // silently as a black frame otherwise -- the
                              // single most confusing thing a review player
                              // can do, because the upload plainly succeeded.
                              onError={() => {
                                if (clip.id !== "base-v1") return;
                                setPlaybackError(clip.name || "This file");
                              }}
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

                {/* Decode failure. Shown over the frame because that is where
                    the reviewer is looking, and because the alternative -- a
                    black rectangle and a working scrubber -- reads as "the
                    artist uploaded nothing" rather than "your browser cannot
                    open this codec". */}
                {playbackError && (
                  <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 text-center px-8">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                    <div className="text-sm font-medium text-white">
                      {playbackError} can't be decoded in this browser
                    </div>
                    <p className="text-xs text-white/70 max-w-md leading-relaxed">
                      The file uploaded fine and is safe on the server — the
                      browser just has no decoder for what is inside it. This is
                      almost always ProRes or DNxHD in a .mov. Export an H.264
                      MP4 review copy and upload that; the master stays where it
                      is.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPlaybackError(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

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
                  annotations={displayAnnotations}
                  onAnnotationsChange={applyAnnotationsUpdate}
                  frame={frame}
                  maxFrames={maxFrames}
                  tool={canEdit ? tool : "select"}
                  color={color}
                  colors={COLORS}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectedAnnotationIdChange={setSelectedAnnotationId}
                  onDraggingElementChange={setDraggingElement}
                  currentUserId={currentUser?.id}
                  onionSkin={onionSkin}
                  ghosting={ghosting}
                  readOnly={!canEdit}
                />

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

              {/* A "Previous Shot / Next Shot" pair of thumbnail cards used to
                  float here. Both were invented -- two generated gradients
                  labelled S01_030 and S01_050, hardcoded, belonging to no
                  project and linking nowhere. They took up the bottom third of
                  the frame on every review, which is a large part of why this
                  page read as congested. Removed rather than rebuilt: shot
                  context belongs in the queue and the shot page, and the frame
                  belongs to the footage being reviewed. */}
            </div>

            <div className="h-40 bg-card border-t border-border flex flex-col shrink-0">
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
                {/* Shuttling at anything but 1x is invisible otherwise --
                    people press J or L twice and cannot tell whether it took. */}
                {isPlaying && Math.abs(playbackRate) !== 1 && (
                  <span className="text-xs font-mono font-semibold text-accent-tally">
                    {playbackRate < 0 ? "◀" : "▶"} {Math.abs(playbackRate)}×
                  </span>
                )}
                {isPlaying && playbackRate < 0 && Math.abs(playbackRate) === 1 && (
                  <span className="text-xs font-mono font-semibold text-accent-tally">
                    ◀ 1×
                  </span>
                )}
                {(inPoint !== null || outPoint !== null) && (
                  <span className="text-xs font-mono text-primary flex items-center gap-1.5">
                    ⟦ {inPoint ?? 1} – {outPoint ?? maxFrames} ⟧
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      title="Clear in/out range (X)"
                      onClick={() => {
                        setInPoint(null);
                        setOutPoint(null);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground font-mono hidden lg:inline">
                  J K L shuttle · , . step · I O range · F fullscreen
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
                {/* Annotations Track */}
                <div className="flex h-16 w-full bg-muted/20 rounded relative">
                  {displayAnnotations.map((a) => {
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

                {/* In/out range. Drawn under the playhead so the playhead
                    stays readable while scrubbing inside the range. */}
                {(inPoint !== null || outPoint !== null) && (
                  <div
                    className="absolute top-0 bottom-0 bg-primary/15 border-x-2 border-primary z-[5] pointer-events-none"
                    style={{
                      left: `${(((inPoint ?? 1) - 1) / maxFrames) * 100}%`,
                      width: `${(((outPoint ?? maxFrames) - (inPoint ?? 1)) / maxFrames) * 100}%`,
                    }}
                  />
                )}

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

          {/* Collapsed rail. The comments panel is 320px of permanent chrome
              against a 16:9 frame, which on a laptop leaves the actual footage
              smaller than the notes about it. Collapsing is remembered per
              browser, like the sidebar, because how much room you want for the
              image is a property of the screen you are sitting at. */}
          {commentsCollapsed && (
            <div className="w-10 bg-card border-l border-border flex flex-col items-center py-3 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Show comments panel"
                onClick={() => setCommentsCollapsed(false)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div
                className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground"
                style={{ writingMode: "vertical-rl" }}
              >
                Comments{comments.length > 0 ? ` · ${comments.length}` : ""}
              </div>
            </div>
          )}

          {/* Right: Comments & Properties */}
          <div
            className={cn(
              "w-80 bg-card border-l border-border flex-col shrink-0",
              commentsCollapsed ? "hidden" : "flex",
            )}
          >
            <Tabs
              defaultValue="comments"
              className="flex-1 flex flex-col h-full"
            >
              <div className="p-4 border-b border-border bg-muted/10 shrink-0 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  title="Hide comments panel — widens the player"
                  onClick={() => setCommentsCollapsed(true)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
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
                        <div className="flex items-center gap-2 text-sm">
                          {reviewWorkflowStatus === "pm-review" ? (
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50 border-t-primary animate-spin" />
                          ) : reviewWorkflowStatus === "producer-review" ||
                            reviewWorkflowStatus === "approved" ? (
                            <CheckCircle2 className="w-4 h-4 text-[#1E7A34]" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/40" />
                          )}
                          Production Head{" "}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {reviewWorkflowStatus === "producer-review" ||
                            reviewWorkflowStatus === "approved"
                              ? "Approved"
                              : reviewWorkflowStatus === "pm-review"
                                ? "Pending"
                                : "Waiting"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {reviewWorkflowStatus === "producer-review" ? (
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50 border-t-primary animate-spin" />
                          ) : reviewWorkflowStatus === "approved" ? (
                            <CheckCircle2 className="w-4 h-4 text-[#1E7A34]" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/40" />
                          )}
                          Main Producer{" "}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {reviewWorkflowStatus === "approved"
                              ? "Approved"
                              : reviewWorkflowStatus === "producer-review"
                                ? "Pending"
                                : "Waiting"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {approvalEvents.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground/70 tracking-wide mb-1.5">
                        HISTORY
                      </div>
                      <AnimatePresence initial={false}>
                        {[...approvalEvents]
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
                                  {users.find((u) => u.id === ev.byUserId)
                                    ?.name ?? "Unknown"}
                                </span>{" "}
                                <span className="text-muted-foreground">
                                  {APPROVAL_ACTION_LABEL[ev.action]}
                                </span>
                                <div className="text-[10px] text-muted-foreground/70">
                                  {new Date(ev.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {comments.length === 0 && (
                    <div className="text-sm text-muted-foreground italic text-center mt-10">
                      No comments on this version yet.
                    </div>
                  )}
                  {comments.map((comment) => {
                    const user = comment.authorId
                      ? users.find((u) => u.id === comment.authorId)
                      : null;
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

                {/* Gated on the capability the API enforces, not just on
                    viewerMode: an admin holds no submit_reviews, so the
                    composer used to render for them and every send 403'd. */}
                {!viewerMode && !canSubmitReview && (
                  <div className="p-4 border-t border-border bg-card shrink-0 text-xs text-muted-foreground">
                    Your role can view this review but not post feedback on it.
                  </div>
                )}
                {!viewerMode && canSubmitReview && (
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
                          postComment.mutate(
                            { frame, text: "Frame stamped for reference." },
                            {
                              onSuccess: () =>
                                toast({
                                  description: `Frame ${frame} stamped.`,
                                }),
                            },
                          );
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
                      {clientNotes.map((note) => (
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
                              disabled={!currentUser || !versionId}
                              onClick={() => {
                                if (!currentUser || !versionId) return;
                                transferClientNote.mutate(note.id, {
                                  onSuccess: () =>
                                    toast({
                                      title: "Feedback Transferred",
                                      description:
                                        "The client note is now visible in the team comment stream.",
                                    }),
                                  onError: (err) =>
                                    toast({
                                      title: "Transfer failed",
                                      description:
                                        err instanceof Error
                                          ? err.message
                                          : "Please try again.",
                                      variant: "destructive",
                                    }),
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
                    const ann = displayAnnotations.find(
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
