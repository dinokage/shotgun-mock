import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Play,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ChevronLeft,
  LogOut,
  CheckCircle2,
  Send,
  Clock,
  Building2,
  User,
  PenTool,
  CalendarDays,
  PackageCheck,
  X,
  Inbox,
  Paperclip,
  Camera,
  Maximize,
  Minimize,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/apiClient";
import {
  useClientChatChannels,
  useChatMessages,
  usePostChatMessage,
} from "@/hooks/useChat";
import { useProjectStore } from "@/store/projects";
import { useLocation } from "wouter";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import { Lock, Key } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useReviewStore } from "@/store/reviews";
import {
  usePresentationValue,
  useClientNotes,
  useCreateClientNote,
} from "@/hooks/useReviewSession";
import { useShotStore } from "@/store/shots";
import { useBroadcasts, toBroadcast } from "@/hooks/useBroadcasts";
import { cn } from "@/lib/utils";
import { getPlaceholderThumbnail } from "@/lib/placeholderArt";
import { usePlaceholderVideoSrc } from "@/hooks/usePlaceholderVideo";
import {
  AnnotationToolbar,
  AnnotationCanvas,
  PlaybackControls,
  FrameScrubber,
  PresentationLockBanner,
  GhostingToggle,
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
import { useEpisodes } from "@/hooks/useEpisodes";
import { useSequences } from "@/hooks/useSequences";
import { useShots as useShotsQuery, type ShotDTO } from "@/hooks/useShots";
import { hashString } from "@/lib/seededMock";
import { Film, Layers, ChevronRight, FolderKanban } from "lucide-react";

const COLORS = [
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#eab308",
  "#d946ef",
  "#ffffff",
];

/**
 * Resolves the thumbnail seed to render for a shot's preview art. Prefers
 * the seed on the shot's actual current Version record (so the preview
 * reflects the delivered version, not just the shot), falling back to the
 * shot's own seed when no matching Version row exists in the mock data.
 */
function resolveThumbnailSeed(
  shot: {
    id: string;
    currentVersion: string;
    thumbnailSeed: number;
  },
  versions: {
    entityType: string;
    entityId: string;
    versionNumber: string;
    thumbnailSeed: number;
  }[],
): number {
  const currentVersionRecord = versions.find(
    (v) =>
      v.entityType === "shot" &&
      v.entityId === shot.id &&
      v.versionNumber === shot.currentVersion,
  );
  return currentVersionRecord?.thumbnailSeed ?? shot.thumbnailSeed;
}

export default function ClientReview() {
  const { currentUser, logout, tenantName } = useAuthStore();
  const [, setLocation] = useLocation();

  const [accessCode, setAccessCode] = useState("");
  const [clientAuthenticated, setClientAuthenticated] = useState(false);
  // Set once an access code is successfully redeemed against the real
  // POST /client-access/redeem route below — null for an explicit
  // 'client'-role user, who bypasses the code entirely and keeps this
  // page's prior unscoped behavior. When set, it scopes what this page
  // requests to the redeemed link's granted project/episode/version (see
  // pendingReviews below) — client-side only; full server-side enforcement
  // of this scope is a later task's responsibility.
  const [clientScope, setClientScope] = useState<{
    projectId: string | null;
    episodeId: string | null;
    versionId: string | null;
  } | null>(null);

  // If a user has the explicit 'client' role, they automatically bypass the access code.
  // Otherwise, everyone (even managers testing the portal) must enter the access code.
  const isExplicitClient = currentUser?.role === "client";

  // A signed-in client account can be granted more than one project (a
  // redeemed access-code link cannot -- it's minted for exactly one
  // project/episode/shot by nature, so it keeps going straight into that
  // single scope, unaffected by any of this). This is the new top level:
  // "which project" before "which episode."
  const [activeReviewProjectId, setActiveReviewProjectId] = useState<
    string | null
  >(null);

  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

  const [tool, setTool] = useState<AnnotationTool>("select");
  const [color, setColor] = useState("#10b981");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [ghosting, setGhosting] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [draggingElement, setDraggingElement] =
    useState<DraggingElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // 240 is only the pre-load default (matches review.tsx's PROJECT_FPS=24 *
  // ~10s guess) -- set for real once the video's real duration loads, below.
  const CLIENT_PROJECT_FPS = 24;
  const [mediaDurationSec, setMediaDurationSec] = useState<number | null>(null);
  const maxFrames = mediaDurationSec
    ? Math.max(1, Math.round(mediaDurationSec * CLIENT_PROJECT_FPS))
    : 240;
  // Otherwise a shorter clip briefly inherits the previous, longer one's
  // real duration until its own metadata loads.
  useEffect(() => {
    setMediaDurationSec(null);
  }, [activeReviewId]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      playerContainerRef.current?.requestFullscreen().catch(() => {});
    }
  };

  // Simpler than review.tsx's version: one video element here, not several
  // composited clips, so there's no blend-mode/opacity stack to draw.
  const handleScreenshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast({
        title: "Screenshot copied",
        description: "The current frame is on your clipboard.",
      });
    } catch (err: any) {
      toast({
        title: "Couldn't copy screenshot",
        description: err?.message ?? "Your browser may not support this.",
        variant: "destructive",
      });
    }
  };

  const versions = useReviewStore((s) => s.versions);
  const projects = useProjectStore((s) => s.projects);

  // Pending client reviews — sourced from the persisted shot store (not the
  // static SHOTS import) so an Approve/Request Changes decision below is
  // reflected here immediately, and stays reflected across reloads. This is
  // still the access-code path's data source: a redeemed link is always
  // scoped to exactly one project/episode/shot, so it never needs the
  // project-picker below and keeps its original behavior untouched.
  const shots = useShotStore((s) => s.shots);
  const updateReviewStatus = useShotStore((s) => s.updateReviewStatus);

  // A signed-in client's shots for whichever project is currently active --
  // fetched directly (not from the global store, which only ever holds
  // whichever single project got hydrated at login) so switching projects
  // in the picker below actually reflects that project's real shots.
  // ShotDTO has no thumbnailSeed (a mock-only concept) -- derive one the
  // same deterministic way auth.ts's login hydration already does for
  // VERSIONS, so placeholder art still renders when a shot has no matching
  // Version row.
  const { data: activeProjectShotsRaw = [] } = useShotsQuery(
    isExplicitClient && activeReviewProjectId
      ? activeReviewProjectId
      : undefined,
  );

  // Task due dates + upcoming delivery expirations across every project this
  // session can see (not just the one currently being browsed) -- the whole
  // point is "what's coming up," which shouldn't require picking a project
  // first. Scoped server-side via getClientScope, same as everything else on
  // this page; never returns assignee/description/hours, only what a client
  // should actually see.
  interface ClientCalendarData {
    tasks: {
      id: string;
      title: string;
      dueDate: string;
      status: string;
      shotId: string;
      shotName: string | null;
      projectId: string | null;
    }[];
    completedTasks: {
      id: string;
      title: string;
      completedAt: string;
      status: string;
      shotId: string;
      shotName: string | null;
      projectId: string | null;
    }[];
    deliveries: {
      id: string;
      name: string;
      expiresAt: string | null;
      projectId: string | null;
    }[];
  }
  const [clientView, setClientView] = useState<"reviews" | "calendar" | "chat">(
    "reviews",
  );
  const { data: calendarData } = useQuery<ClientCalendarData>({
    queryKey: ["client-calendar"],
    queryFn: () => apiClient.get<ClientCalendarData>("/client-access/calendar"),
    enabled: clientAuthenticated || isExplicitClient,
    staleTime: 30000,
  });
  const upcomingItems = useMemo(() => {
    if (!calendarData) return [];
    const now = Date.now();
    const items: {
      id: string;
      label: string;
      date: Date;
      kind: "task" | "delivery";
      shotId?: string;
    }[] = [];
    for (const t of calendarData.tasks) {
      if (!t.dueDate) continue;
      items.push({
        id: `task-${t.id}`,
        label: `${t.shotName ?? "Shot"} — ${t.title || "Task"} due`,
        date: new Date(t.dueDate),
        kind: "task",
        shotId: t.shotId,
      });
    }
    for (const d of calendarData.deliveries) {
      if (!d.expiresAt) continue;
      items.push({
        id: `delivery-${d.id}`,
        label: `Delivery "${d.name}" expires`,
        date: new Date(d.expiresAt),
        kind: "delivery",
      });
    }
    return items
      .filter((i) => i.date.getTime() >= now - 24 * 60 * 60 * 1000) // keep "today" even if slightly past
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [calendarData]);

  // Month-grid calendar: every day in the viewed month gets a cell (not just
  // days that happen to have something on them), with due tasks, completed
  // tasks (see completedTasks' lastStatusUpdate-as-completedAt comment on the
  // server) and delivery windows all plotted on their real dates. Keyed by
  // local (not UTC) Y-M-D so a task due "today" always lands in today's cell
  // regardless of the viewer's timezone offset from UTC.
  type CalendarDayEvent = {
    id: string;
    kind: "due" | "completed" | "delivery";
    label: string;
    shotId?: string;
  };
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const calendarEventsByDay = useMemo(() => {
    const map = new Map<string, CalendarDayEvent[]>();
    const push = (date: Date, ev: CalendarDayEvent) => {
      const key = dayKey(date);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    };
    if (!calendarData) return map;
    for (const t of calendarData.tasks) {
      if (!t.dueDate) continue;
      push(new Date(t.dueDate), {
        id: `due-${t.id}`,
        kind: "due",
        label: `${t.shotName ?? "Shot"} — ${t.title || "Task"} due`,
        shotId: t.shotId,
      });
    }
    for (const t of calendarData.completedTasks) {
      push(new Date(t.completedAt), {
        id: `done-${t.id}`,
        kind: "completed",
        label: `${t.shotName ?? "Shot"} — ${t.title || "Task"} completed`,
        shotId: t.shotId,
      });
    }
    for (const d of calendarData.deliveries) {
      if (!d.expiresAt) continue;
      push(new Date(d.expiresAt), {
        id: `delivery-${d.id}`,
        kind: "delivery",
        label: `Delivery "${d.name}" expires`,
      });
    }
    return map;
  }, [calendarData]);

  const today = useMemo(() => new Date(), []);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Grid always starts on a Sunday so weekday columns line up, even when
    // that pulls in a few trailing days from the previous month.
    const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
    const days: Date[] = [];
    const cursor = new Date(gridStart);
    // 6 rows x 7 days covers every month layout (a 31-day month starting on
    // a Saturday needs all 6) without ever falling short.
    while (days.length < 42) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks, daysInMonth };
  }, [calendarMonth]);
  const selectedDayEvents = calendarEventsByDay.get(dayKey(selectedDay)) ?? [];

  // Chat: a client only ever sees the one "client" channel per project it
  // has access to (see GET /chat/client-channels) -- production_head and
  // department leads, never artists, per the studio's own requirement.
  const { data: chatChannels = [] } = useClientChatChannels();
  const [activeChatChannelId, setActiveChatChannelId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!activeChatChannelId && chatChannels.length > 0) {
      setActiveChatChannelId(chatChannels[0].id);
    }
  }, [chatChannels, activeChatChannelId]);
  const { messages: chatMessages } = useChatMessages(activeChatChannelId);
  const postChatMessage = usePostChatMessage();
  const [chatInput, setChatInput] = useState("");
  const chatTotalUnread = chatChannels.reduce(
    (sum, c) => sum + c.unreadCount,
    0,
  );
  const handleSendChat = () => {
    const body = chatInput.trim();
    if (!body || !activeChatChannelId) return;
    setChatInput("");
    postChatMessage.mutate({ channelId: activeChatChannelId, body });
  };
  const activeProjectShots = useMemo(
    () =>
      activeProjectShotsRaw.map((s: ShotDTO) => ({
        ...s,
        thumbnailSeed: hashString(s.id),
      })),
    [activeProjectShotsRaw],
  );

  // Scoped to the redeemed access link's grant (see clientScope above), most
  // specific field first — a versionId grant limits to that single shot's
  // delivered version, an episodeId grant to that episode's shots, a
  // projectId grant to that project's shots. clientScope is null for the
  // legacy bypass paths, which keep seeing every pending review as before.
  const pendingReviews = (isExplicitClient ? activeProjectShots : shots)
    .filter((s) => s.status === "client-review")
    .filter((s) => {
      if (isExplicitClient) return true; // already scoped by the project fetch above
      if (!clientScope) return true;
      if (clientScope.versionId) {
        const scopedVersion = versions.find(
          (v) => v.id === clientScope.versionId,
        );
        return scopedVersion ? scopedVersion.entityId === s.id : false;
      }
      if (clientScope.episodeId) return s.episodeId === clientScope.episodeId;
      if (clientScope.projectId) return s.projectId === clientScope.projectId;
      return true;
    });

  // Dashboard drill-down: Project -> Episode -> Sequence -> Shot, same
  // structure as the internal app's own Episodes tab
  // (project-detail/EpisodesTab.tsx). The "projects" level only applies to a
  // signed-in client (who may hold more than one grant) -- an access-code
  // session is always scoped to a single project already, so it skips
  // straight to "episodes" exactly as before.
  const [reviewLevel, setReviewLevel] = useState<
    "projects" | "episodes" | "sequences" | "shots"
  >(isExplicitClient ? "projects" : "episodes");
  const [activeReviewEpisodeId, setActiveReviewEpisodeId] = useState<
    string | null
  >(null);
  const [activeReviewSequenceId, setActiveReviewSequenceId] = useState<
    string | null
  >(null);
  // A signed-in client's active project comes from the picker above; an
  // access-code session still derives it the old way -- every pendingReviews
  // shot belongs to the same client-granted project, so any one of them
  // names it, falling back to the projects store for the (rare)
  // all-caught-up case where pendingReviews is empty.
  const reviewProjectId = isExplicitClient
    ? (activeReviewProjectId ?? undefined)
    : (pendingReviews[0]?.projectId ?? projects[0]?.id);
  const { data: reviewEpisodes = [] } = useEpisodes(reviewProjectId);
  const { data: reviewSequences = [] } = useSequences(reviewProjectId);
  const activeReviewProject = projects.find(
    (p) => p.id === activeReviewProjectId,
  );
  const activeReviewEpisode = reviewEpisodes.find(
    (e) => e.id === activeReviewEpisodeId,
  );
  const activeReviewSequence = reviewSequences.find(
    (s) => s.id === activeReviewSequenceId,
  );

  const activeShot = activeReviewId
    ? shots.find((s) => s.id === activeReviewId)
    : null;
  const activeProject = activeShot
    ? projects.find((p) => p.id === activeShot.projectId)
    : null;

  // The real Version row behind the shot on screen. Presentation Mode and
  // client notes are both keyed to it server-side, so the lock follows
  // whatever version the presenter actually has the floor on.
  const activeVersionId = useMemo(() => {
    if (!activeShot) return undefined;
    const forShot = versions.filter(
      (v) => v.entityType === "shot" && v.entityId === activeShot.id,
    );
    return (
      forShot.find((v) => v.versionNumber === activeShot.currentVersion)?.id ??
      forShot[0]?.id
    );
  }, [activeShot, versions]);

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId),
    [versions, activeVersionId],
  );

  // Annotations are persisted server-side, keyed to the real Version row
  // above. PRESENTED_VERSION_ID (the id this used to key on) was a
  // hardcoded demo id that no longer exists in the database -- every client
  // drawing was silently rejected server-side ("Invalid versionId") with no
  // error surfaced anywhere. activeVersionId is the same id the internal
  // review player itself annotates against.
  const { data: annotations = [] } = useAnnotations(activeVersionId);
  const createAnnotation = useCreateAnnotation(activeVersionId);
  const updateAnnotation = useUpdateAnnotation(activeVersionId);
  const deleteAnnotation = useDeleteAnnotation(activeVersionId);
  // Bridges AnnotationCanvas's raw dispatch-style API onto the server-backed
  // list above — added ids become createAnnotation.mutate calls, dropped
  // ids become deleteAnnotation.mutate calls, and ids present in both but
  // with changed fields become updateAnnotation.mutate calls against
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

  // Presentation Mode: when an internal reviewer is presenting the version
  // the client is looking at, this viewer's playhead is locked to theirs and
  // the only actions available collapse down to Approve / Request Changes —
  // which is already the entirety of this portal's decision actions.
  const presentation = usePresentationValue(activeVersionId);
  const isLockedViewer =
    presentation.isActive && presentation.presenterId !== currentUser?.id;

  // Studio Updates: the one bridge from the internal status-broadcast
  // feature into this external, unauthenticated portal — a producer/manager
  // marks a broadcast 'internal_and_client' and scopes it to this project.
  // GET /broadcasts already applies both filters server-side for a
  // client-access session (audience + the project its link is scoped to);
  // they are repeated here as defence in depth and because an internal
  // session hitting this page gets the unfiltered studio feed. Capped at 3;
  // renders nothing when empty so a client is never shown an empty state for
  // an internal feature they don't otherwise know exists.
  const { data: broadcastRows = [] } = useBroadcasts(activeProject?.id);
  const studioUpdates = useMemo(
    () =>
      broadcastRows
        .map(toBroadcast)
        .filter(
          (b) =>
            b.audience === "internal_and_client" &&
            b.projectId === activeProject?.id,
        )
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 3),
    [broadcastRows, activeProject],
  );

  // Deterministic render-preview art for the player's video area, so there's
  // always something on screen before playback starts (or if it never does).
  const activeVersionPoster = useMemo(
    () =>
      activeShot
        ? getPlaceholderThumbnail(
            resolveThumbnailSeed(activeShot, versions),
            1280,
            720,
          )
        : undefined,
    [activeShot],
  );

  // The version's real uploaded media, not a generated placeholder clip --
  // this was the core of the "client portal shows a placeholder, not real
  // footage" gap: every shot played the same fake clip regardless of what
  // the studio had actually uploaded and approved for review. Falls back to
  // the placeholder only when the version genuinely has no media yet, so
  // the player still shows *something* rather than a blank frame.
  const hasRealMedia = !!activeVersion?.mediaUrl;
  const activeMediaExt = activeVersion?.mediaUrl
    ?.split(".")
    .pop()
    ?.toLowerCase();
  const activeMediaIsImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(
    activeMediaExt || "",
  );
  const placeholderVideoSrc = usePlaceholderVideoSrc(
    activeShot ? resolveThumbnailSeed(activeShot, versions) : 0,
  );
  const activeVideoSrc = hasRealMedia
    ? (activeVersion!.mediaUrl ?? undefined)
    : placeholderVideoSrc;

  // Client feedback moderation: notes submitted here are held pending until
  // an internal reviewer explicitly transfers them into the team comment
  // stream — they never become visible internally by default.
  const { data: shotNotes = [] } = useClientNotes(activeShot?.id);
  const createClientNote = useCreateClientNote(activeShot?.id);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = Date.now();

    if (isPlaying && activeReviewId && !isLockedViewer) {
      if (videoRef.current) {
        videoRef.current.currentTime = (frame - 1) / 24;
        videoRef.current.play().catch(() => {});
      }

      const updateFrame = () => {
        const now = Date.now();
        const dt = now - lastTime;
        if (dt >= 1000 / 24) {
          setFrame((f) => {
            let nextF = f + 1;
            if (nextF > maxFrames) {
              nextF = 1;
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
              }
            }
            return nextF;
          });
          lastTime = now;
        }
        animationFrameId = requestAnimationFrame(updateFrame);
      };
      animationFrameId = requestAnimationFrame(updateFrame);
    } else {
      if (videoRef.current) videoRef.current.pause();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, activeReviewId, maxFrames, isLockedViewer]);

  // While locked, mirror the presenter's playhead and give up local playback.
  useEffect(() => {
    if (!isLockedViewer) return;
    setIsPlaying(false);
    setFrame(presentation.frame);
  }, [isLockedViewer, presentation.frame]);

  // Global keydown for Spacebar play/pause and Arrow keys for scrubbing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;
      if (isLockedViewer) return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setIsPlaying(false);
        setFrame((f) => Math.max(1, f - 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setIsPlaying(false);
        setFrame((f) => Math.min(maxFrames, f + 1));
      } else if (e.code === "Backspace" || e.code === "Delete") {
        if (selectedAnnotationId) {
          deleteAnnotation.mutate(selectedAnnotationId);
          setSelectedAnnotationId(null);
        }
      } else if (e.code === "Escape") {
        setSelectedAnnotationId(null);
        setTool("select");
      } else if (e.key === "1") setTool("select");
      else if (e.key === "2") setTool("pen");
      else if (e.key === "3") setTool("arrow");
      else if (e.key === "4") setTool("rectangle");
      else if (e.key === "5") setTool("text");
      else if (e.key === "f" || e.key === "F") handleToggleFullscreen();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [maxFrames, isLockedViewer, selectedAnnotationId]);

  // Handle global mouse move for canvas dragging
  useEffect(() => {
    if (!draggingElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingElement.startX;
      const dy = e.clientY - draggingElement.startY;

      if (draggingElement.type === "annotation") {
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

  const handleSubmit = async (action: "approved" | "changes_requested") => {
    if (!activeShot) return;
    {
      // Persist the real decision: the shot's clientReviewStatus (the
      // review-pipeline record) and its overall status (what takes it out of
      // "Awaiting Review" on this dashboard and on the producer home page,
      // both of which filter on status === 'client-review'). Both fields are
      // set together by PUT /shots/:id/client-review (the only write a
      // client-access session is capable of) -- a separate updateShot() call
      // here would hit the generic PUT /shots/:id, which requires edit_tasks
      // and always 403s for a client session.
      try {
        await updateReviewStatus(
          activeShot.id,
          false,
          action === "approved" ? "approved" : "changes-requested",
        );
      } catch (err) {
        // Stay on the shot so nothing looks settled that wasn't.
        toast({
          title: "Your decision wasn't saved",
          description: `${
            err instanceof Error && err.message
              ? err.message
              : "The studio server didn't respond."
          } Please try again, or contact your studio producer.`,
          variant: "destructive",
        });
        return;
      }
    }
    toast({
      title: action === "approved" ? "Approved" : "Changes Requested",
      description: "Your decision has been sent to the studio team.",
    });
    setTimeout(() => {
      setActiveReviewId(null);
    }, 1500);
  };

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const handleAccessSubmit = async () => {
    try {
      const res = await apiClient.post<{
        scope: {
          projectId: string | null;
          episodeId: string | null;
          versionId: string | null;
        };
      }>("/client-access/redeem", { code: accessCode });
      setClientScope(res.scope);
      setClientAuthenticated(true);
    } catch {
      toast({
        title: "Invalid Code",
        description: "That access code is invalid or has expired.",
        variant: "destructive",
      });
    }
  };

  // Separate Client Login (Access Code)
  if (!clientAuthenticated && !isExplicitClient) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 p-4 gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <div className="w-3.5 h-3.5 bg-card rounded-sm" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">
            Forge
          </span>
        </div>
        <Card className="w-full max-w-md border-border/50 shadow-2xl">
          <CardHeader className="space-y-2 text-center pb-6">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Client Review Portal
            </CardTitle>
            <CardDescription>
              Enter your secure access code to view pending deliverables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAccessSubmit();
                }}
                className="text-center text-lg tracking-widest h-12"
              />
            </div>
            <Button
              className="w-full h-12 text-md font-semibold"
              onClick={handleAccessSubmit}
            >
              Access Review Session
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Protected by Forge Secure Share
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Left nav shared by every authenticated view (browsing, the player, and
  // the full-page Calendar/Chat below) -- defined once here so switching
  // views doesn't lose place in a review, and so Calendar/Chat are reachable
  // no matter where in the portal a client currently is.
  const navItemClass = (view: typeof clientView) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      clientView === view
        ? "bg-primary/15 text-primary"
        : "text-zinc-400 hover:text-white hover:bg-white/5"
    }`;
  const sidebar = (
    <aside className="w-56 shrink-0 h-screen bg-zinc-900/60 border-r border-white/10 flex flex-col">
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-white/10 shrink-0">
        <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
          <div className="w-3.5 h-3.5 bg-card rounded-sm" />
        </div>
        <div className="leading-tight">
          <div className="font-bold text-sm tracking-tight">Forge</div>
          <div className="text-[10px] text-zinc-500">Client Portal</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <button
          className={navItemClass("reviews")}
          onClick={() => setClientView("reviews")}
        >
          <Inbox className="w-4 h-4" /> Reviews
        </button>
        <button
          className={navItemClass("calendar")}
          onClick={() => setClientView("calendar")}
        >
          <CalendarDays className="w-4 h-4" /> Calendar
          {upcomingItems.length > 0 && (
            <Badge
              variant="outline"
              className="ml-auto h-5 px-1.5 border-primary/30 text-primary"
            >
              {upcomingItems.length}
            </Badge>
          )}
        </button>
        <button
          className={navItemClass("chat")}
          onClick={() => setClientView("chat")}
        >
          <MessageSquare className="w-4 h-4" /> Chat
          {chatTotalUnread > 0 && (
            <Badge
              variant="outline"
              className="ml-auto h-5 px-1.5 border-primary/30 text-primary"
            >
              {chatTotalUnread}
            </Badge>
          )}
        </button>
      </nav>
      <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
        <Badge
          variant="outline"
          className="w-full justify-center border-status-green/30 text-status-green bg-status-green/10 gap-1.5"
        >
          <Lock className="w-3 h-3" /> Secure Connection
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-zinc-400 hover:text-white"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" /> Exit
        </Button>
      </div>
    </aside>
  );

  if (clientView === "calendar" || clientView === "chat") {
    return (
      <div className="h-screen flex bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
        {sidebar}
        {clientView === "calendar" ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-8 py-8">
              <h1 className="text-2xl font-bold tracking-tight mb-1">
                Calendar
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                Task due dates, completed work, and delivery windows across
                every project you have access to.
              </p>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-white/10 bg-zinc-900/40 hover:bg-zinc-800"
                    onClick={() =>
                      setCalendarMonth(
                        (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-white/10 bg-zinc-900/40 hover:bg-zinc-800"
                    onClick={() =>
                      setCalendarMonth(
                        (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <h2 className="text-sm font-semibold ml-2">
                    {calendarMonth.toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-white/10 bg-zinc-900/40 hover:bg-zinc-800"
                  onClick={() => {
                    setCalendarMonth(
                      new Date(today.getFullYear(), today.getMonth(), 1),
                    );
                    setSelectedDay(today);
                  }}
                >
                  Today
                </Button>
              </div>

              <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-900/20">
                <div className="grid grid-cols-7 border-b border-white/10 bg-zinc-900/40">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d) => (
                      <div
                        key={d}
                        className="px-2 py-2 text-center text-[10px] uppercase tracking-wide text-zinc-500 font-semibold"
                      >
                        {d}
                      </div>
                    ),
                  )}
                </div>
                {calendarWeeks.weeks.map((week, wi) => (
                  <div
                    key={wi}
                    className="grid grid-cols-7 border-b border-white/5 last:border-b-0"
                  >
                    {week.map((day) => {
                      const inMonth =
                        day.getMonth() === calendarMonth.getMonth();
                      const key = dayKey(day);
                      const events = calendarEventsByDay.get(key) ?? [];
                      const isToday = key === dayKey(today);
                      const isSelected = key === dayKey(selectedDay);
                      const dueCount = events.filter(
                        (e) => e.kind === "due",
                      ).length;
                      const doneCount = events.filter(
                        (e) => e.kind === "completed",
                      ).length;
                      const deliveryCount = events.filter(
                        (e) => e.kind === "delivery",
                      ).length;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedDay(day)}
                          className={`min-h-[76px] p-1.5 text-left border-r border-white/5 last:border-r-0 transition-colors ${
                            inMonth ? "bg-transparent" : "bg-zinc-950/40"
                          } ${isSelected ? "ring-1 ring-inset ring-primary/60 bg-primary/5" : "hover:bg-white/5"}`}
                        >
                          <div
                            className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${
                              isToday
                                ? "bg-primary text-primary-foreground font-semibold"
                                : inMonth
                                  ? "text-zinc-300"
                                  : "text-zinc-600"
                            }`}
                          >
                            {day.getDate()}
                          </div>
                          {events.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {dueCount > 0 && (
                                <span
                                  className="flex items-center gap-0.5 text-[9px] font-medium text-primary bg-primary/10 rounded px-1"
                                  title={`${dueCount} due`}
                                >
                                  <CalendarDays className="w-2.5 h-2.5" />{" "}
                                  {dueCount}
                                </span>
                              )}
                              {doneCount > 0 && (
                                <span
                                  className="flex items-center gap-0.5 text-[9px] font-medium text-emerald-400 bg-emerald-400/10 rounded px-1"
                                  title={`${doneCount} completed`}
                                >
                                  <CheckCircle2 className="w-2.5 h-2.5" />{" "}
                                  {doneCount}
                                </span>
                              )}
                              {deliveryCount > 0 && (
                                <span
                                  className="flex items-center gap-0.5 text-[9px] font-medium text-amber-400 bg-amber-400/10 rounded px-1"
                                  title={`${deliveryCount} delivery`}
                                >
                                  <PackageCheck className="w-2.5 h-2.5" />{" "}
                                  {deliveryCount}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3">
                  {selectedDay.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                {selectedDayEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-28 border border-white/5 rounded-xl bg-zinc-900/20">
                    <p className="text-zinc-500 text-sm">
                      Nothing on this day.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayEvents.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.kind !== "delivery" && item.shotId) {
                            const shot =
                              shots.find((s) => s.id === item.shotId) ??
                              activeProjectShots.find(
                                (s) => s.id === item.shotId,
                              );
                            if (shot) {
                              setActiveReviewId(shot.id);
                              setClientView("reviews");
                            }
                          }
                        }}
                        className={`w-full flex items-center gap-4 p-4 rounded-lg border border-white/10 bg-zinc-900/40 text-left transition-colors ${
                          item.kind !== "delivery"
                            ? "hover:border-primary/50 cursor-pointer"
                            : "cursor-default"
                        }`}
                      >
                        {item.kind === "delivery" ? (
                          <PackageCheck className="w-5 h-5 text-amber-400 shrink-0" />
                        ) : item.kind === "completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <CalendarDays className="w-5 h-5 text-primary shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">
                            {item.label}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-zinc-600 mt-6">
                Need an update on something? Open Chat to message the production
                team directly, or open a task above to leave a note on that
                shot.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <div className="w-64 shrink-0 border-r border-white/10 bg-zinc-900/30 overflow-y-auto">
              <div className="h-16 px-5 flex items-center border-b border-white/10">
                <h2 className="text-sm font-semibold">Chat</h2>
              </div>
              {chatChannels.length === 0 ? (
                <p className="text-xs text-zinc-500 p-4">
                  No chat channel yet -- your studio contact sets this up once
                  you're granted project access.
                </p>
              ) : (
                <div className="p-2 space-y-1">
                  {chatChannels.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveChatChannelId(c.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                        activeChatChannelId === c.id
                          ? "bg-primary/15 text-primary"
                          : "text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {c.unreadCount > 0 && (
                        <Badge className="h-5 px-1.5 shrink-0">
                          {c.unreadCount}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              {!activeChatChannelId ? (
                <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                  Select a channel to start messaging.
                </div>
              ) : (
                <>
                  <div className="h-16 px-6 flex items-center border-b border-white/10 shrink-0">
                    <h2 className="text-sm font-semibold">
                      {
                        chatChannels.find((c) => c.id === activeChatChannelId)
                          ?.name
                      }
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {chatMessages.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center mt-8">
                        No messages yet -- say hello.
                      </p>
                    ) : (
                      chatMessages.map((m) => {
                        const mine = m.authorId === currentUser?.id;
                        return (
                          <div
                            key={m.id}
                            className={`flex ${mine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-xl px-4 py-2 ${
                                mine
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-zinc-800 text-zinc-100"
                              }`}
                            >
                              {!mine && (
                                <div className="text-xs font-semibold text-zinc-400 mb-0.5">
                                  {m.authorName ?? "Team"}
                                </div>
                              )}
                              {m.body && (
                                <div className="text-sm whitespace-pre-wrap">
                                  {m.body}
                                </div>
                              )}
                              {m.attachmentUrl && (
                                <a
                                  href={m.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 text-xs underline mt-1 opacity-90"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  {m.attachmentName ?? "Attachment"}
                                </a>
                              )}
                              <div
                                className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-zinc-500"}`}
                              >
                                {new Date(m.createdAt).toLocaleTimeString(
                                  undefined,
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="p-4 border-t border-white/10 shrink-0">
                    <div className="flex items-end gap-2 bg-zinc-900/60 border border-white/10 rounded-xl p-2">
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendChat();
                          }
                        }}
                        placeholder="Message the production team..."
                        className="flex-1 max-h-32 min-h-[40px] bg-transparent border-0 focus:ring-0 outline-none p-2 resize-none text-[15px]"
                        rows={1}
                      />
                      <Button
                        onClick={handleSendChat}
                        disabled={!chatInput.trim()}
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-lg"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // DASHBOARD VIEW
  if (!activeReviewId) {
    return (
      <div className="h-screen flex bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
        {sidebar}
        <div className="flex-1 overflow-y-auto">
          <header className="h-16 px-8 flex items-center justify-between border-b border-white/10 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
            <div className="leading-tight">
              <div className="font-bold text-lg tracking-tight">
                Your Reviews
              </div>
              <div className="text-[11px] text-zinc-500">
                {isExplicitClient
                  ? tenantName
                  : "External review — no studio login required"}
              </div>
            </div>
          </header>

          <main className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {reviewLevel === "projects" ? (
                    "Your Projects"
                  ) : reviewLevel === "episodes" && !isExplicitClient ? (
                    "Pending Reviews"
                  ) : (
                    <span className="flex items-center gap-2 text-2xl">
                      <button
                        className="text-zinc-500 hover:text-white transition-colors"
                        onClick={() => {
                          if (reviewLevel === "shots") {
                            setReviewLevel("sequences");
                            setActiveReviewSequenceId(null);
                          } else if (reviewLevel === "sequences") {
                            setReviewLevel("episodes");
                            setActiveReviewEpisodeId(null);
                          } else if (isExplicitClient) {
                            setReviewLevel("projects");
                            setActiveReviewProjectId(null);
                            setActiveReviewEpisodeId(null);
                          }
                        }}
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      {reviewLevel === "episodes" && isExplicitClient
                        ? activeReviewProject?.name
                        : activeReviewEpisode?.name}
                      {reviewLevel === "shots" && activeReviewSequence && (
                        <>
                          <ChevronRight className="w-4 h-4 text-zinc-600" />
                          {activeReviewSequence.name}
                        </>
                      )}
                    </span>
                  )}
                </h1>
                <p className="text-zinc-400 mt-2 text-sm">
                  {reviewLevel === "projects"
                    ? "Select a project to view its pending deliveries."
                    : "Please review the following deliveries and provide your feedback or approval."}
                </p>
              </div>
            </div>

            {reviewLevel === "projects" ? (
              projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 border border-white/5 rounded-xl bg-zinc-900/20">
                  <FolderKanban className="w-16 h-16 text-zinc-600 mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold">No Projects Yet</h3>
                  <p className="text-zinc-500">
                    You haven't been granted access to any projects. Contact
                    your studio producer.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="group bg-zinc-900 border border-white/10 rounded-xl p-6 hover:border-accent-scope/50 transition-all cursor-pointer flex items-center gap-4"
                      onClick={() => {
                        setActiveReviewProjectId(p.id);
                        setReviewLevel("episodes");
                      }}
                    >
                      <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                        <FolderKanban className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-lg truncate">
                          {p.name}
                        </div>
                        {p.type && (
                          <div className="text-sm text-zinc-500">{p.type}</div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    </div>
                  ))}
                </div>
              )
            ) : pendingReviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border border-white/5 rounded-xl bg-zinc-900/20">
                <CheckCircle2 className="w-16 h-16 text-status-green mb-4 opacity-50" />
                <h3 className="text-xl font-semibold">All Caught Up!</h3>
                <p className="text-zinc-500">
                  There are no pending reviews at this time.
                </p>
              </div>
            ) : reviewLevel === "episodes" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reviewEpisodes
                  .filter((ep) =>
                    pendingReviews.some((s) => s.episodeId === ep.id),
                  )
                  .map((ep) => {
                    const count = pendingReviews.filter(
                      (s) => s.episodeId === ep.id,
                    ).length;
                    return (
                      <div
                        key={ep.id}
                        className="group bg-zinc-900 border border-white/10 rounded-xl p-6 hover:border-accent-scope/50 transition-all cursor-pointer flex items-center gap-4"
                        onClick={() => {
                          setActiveReviewEpisodeId(ep.id);
                          setReviewLevel("sequences");
                        }}
                      >
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                          <Film className="w-6 h-6 text-zinc-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-lg truncate">
                            {ep.name}
                          </div>
                          <div className="text-sm text-zinc-500">
                            {count} pending review{count === 1 ? "" : "s"}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                      </div>
                    );
                  })}
              </div>
            ) : reviewLevel === "sequences" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reviewSequences
                  .filter(
                    (sq) =>
                      sq.episodeId === activeReviewEpisodeId &&
                      pendingReviews.some((s) => s.sequenceId === sq.id),
                  )
                  .map((sq) => {
                    const count = pendingReviews.filter(
                      (s) => s.sequenceId === sq.id,
                    ).length;
                    return (
                      <div
                        key={sq.id}
                        className="group bg-zinc-900 border border-white/10 rounded-xl p-6 hover:border-accent-scope/50 transition-all cursor-pointer flex items-center gap-4"
                        onClick={() => {
                          setActiveReviewSequenceId(sq.id);
                          setReviewLevel("shots");
                        }}
                      >
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                          <Layers className="w-6 h-6 text-zinc-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-lg truncate">
                            {sq.name}
                          </div>
                          <div className="text-sm text-zinc-500">
                            {count} pending review{count === 1 ? "" : "s"}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingReviews
                  .filter((s) => s.sequenceId === activeReviewSequenceId)
                  .map((shot) => {
                    const project = projects.find(
                      (p) => p.id === shot.projectId,
                    );
                    return (
                      <div
                        key={shot.id}
                        className="group bg-zinc-900 border border-white/10 rounded-xl overflow-hidden hover:border-accent-scope/50 hover:shadow-[0_0_20px_hsl(var(--accent-scope)/0.15)] transition-all cursor-pointer flex flex-col"
                        onClick={() => setActiveReviewId(shot.id)}
                      >
                        <div
                          className="relative aspect-video bg-zinc-800 overflow-hidden bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${getPlaceholderThumbnail(resolveThumbnailSeed(shot, versions))})`,
                          }}
                        >
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-12 h-12 text-white drop-shadow-md" />
                          </div>
                          {tenantName && (
                            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-md text-[11px] font-medium text-zinc-100 border border-white/10">
                              <Building2 className="w-3 h-3 text-zinc-300" />
                              <span>{tenantName}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-5 flex-1 flex flex-col">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-semibold text-lg">
                                {shot.name}
                              </div>
                              <div className="text-sm text-zinc-400">
                                {project?.name}
                              </div>
                            </div>
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20">
                              Awaiting Review
                            </Badge>
                          </div>
                          <div className="mt-auto pt-4 flex items-center justify-between text-xs text-zinc-500 border-t border-white/5">
                            <span>{shot.usdVersion || "v003.usd"}</span>
                            <span>
                              Delivered{" "}
                              {new Date(shot.updatedAt).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  // PLAYER VIEW
  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden font-sans animate-in fade-in">
      <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 shrink-0 bg-zinc-950">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-white/10"
            onClick={() => {
              setActiveReviewId(null);
              setIsPlaying(false);
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <div className="w-4 h-4 bg-card rounded-sm" />
          </div>
          <div>
            <div className="font-semibold text-lg">
              {activeProject?.name} - {activeShot?.name}
            </div>
            <div className="text-xs text-white/50 flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> External Client Review • Secure
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {tenantName && (
            <div className="flex items-center gap-2 pr-4 border-r border-white/10 text-xs text-white/60">
              <Building2 className="w-4 h-4 text-white/40" />
              <span>
                Delivered by{" "}
                <span className="text-white font-medium">{tenantName}</span>
              </span>
            </div>
          )}
          <span className="text-sm text-white/50 timecode">
            Viewing {activeShot?.usdVersion || "v003.usd"}
          </span>
        </div>
      </div>

      {/* Studio Updates: light trust signal from the delivering studio,
          scoped to this project — see the studioUpdates derivation above. */}
      {studioUpdates.length > 0 && (
        <div className="px-6 py-3 border-b border-white/10 bg-zinc-950 shrink-0">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-zinc-500 tracking-wide">
            <Building2 className="w-3 h-3" />
            STUDIO UPDATES
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {studioUpdates.map((update) => (
              <div
                key={update.id}
                className={cn(
                  "flex-1 min-w-[240px] rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 border-l-2",
                  update.severity === "success" && "border-l-status-green",
                  update.severity === "warning" && "border-l-status-orange",
                  update.severity === "info" && "border-l-white/20",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-zinc-200">
                    {tenantName || "Studio"}
                  </span>
                  <span className="text-[10px] text-zinc-500 timecode shrink-0">
                    {new Date(update.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-snug">
                  {update.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main Player */}
        <div
          ref={playerContainerRef}
          className="flex-1 relative flex flex-col items-center justify-center p-4 bg-black"
        >
          <div
            className="relative w-full max-w-5xl aspect-video bg-zinc-900 bg-cover bg-center rounded-lg overflow-hidden shadow-2xl border border-white/5"
            style={{ backgroundImage: `url(${activeVersionPoster})` }}
          >
            {activeMediaIsImage ? (
              <img
                key={activeShot?.id}
                src={activeVideoSrc}
                alt={activeShot?.name ?? "Review frame"}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <video
                key={activeShot?.id}
                ref={videoRef}
                src={activeVideoSrc}
                poster={activeVersionPoster}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                muted
                playsInline
                // The timeline follows the real footage instead of a fixed
                // 240-frame guess, same fix as review.tsx's own player --
                // without this, any clip not coincidentally ~10s long either
                // couldn't be scrubbed to its true end (longer clips) or left
                // most of the scrubber dead (shorter ones).
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setMediaDurationSec(d);
                }}
              />
            )}

            <AnnotationCanvas
              annotations={annotations}
              onAnnotationsChange={applyAnnotationsUpdate}
              frame={frame}
              maxFrames={maxFrames}
              tool={isLockedViewer ? "select" : tool}
              color={color}
              colors={COLORS}
              selectedAnnotationId={selectedAnnotationId}
              onSelectedAnnotationIdChange={setSelectedAnnotationId}
              onDraggingElementChange={setDraggingElement}
              currentUserId={currentUser?.id}
              selectionRingClassName="border-emerald-500 ring-2 ring-emerald-500/50"
              ghosting={ghosting}
              onionSkin={onionSkin}
            />

            {/* Play overlay if paused */}
            {!isPlaying && !isLockedViewer && (
              <div
                className="absolute inset-0 bg-black/20 flex items-center justify-center cursor-pointer hover:bg-black/40 transition-colors"
                onClick={() => setIsPlaying(true)}
              >
                <div className="w-20 h-20 rounded-full bg-accent-scope/90 flex items-center justify-center backdrop-blur shadow-lg">
                  <Play className="w-10 h-10 text-accent-scope-foreground ml-2" />
                </div>
              </div>
            )}
          </div>

          {/* Presentation Mode lock indicator */}
          <div className="absolute top-6 left-6 z-40">
            <PresentationLockBanner
              show={isLockedViewer}
              presenterName={presentation.presenterName}
              frame={presentation.frame}
              maxFrames={maxFrames}
              variant="client"
            />
          </div>

          {/* Top Floating Toolbar */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur border border-white/10 rounded-lg p-1.5 flex items-center gap-3 z-40 shadow-xl">
            <AnnotationToolbar
              tool={tool}
              onToolChange={setTool}
              color={color}
              onColorChange={setColor}
              colors={COLORS}
              variant="client"
            />
            <div className="w-px h-6 bg-white/10" />
            <GhostingToggle
              active={ghosting}
              onToggle={() => setGhosting(!ghosting)}
              variant="client"
            />
            <button
              onClick={() => setOnionSkin((v) => !v)}
              title="Toggle Onion Skinning"
              className={`p-1.5 rounded-md transition-colors ${onionSkin ? "text-primary bg-primary/15" : "text-zinc-400 hover:text-white hover:bg-white/10"}`}
            >
              <Layers className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={handleScreenshot}
              title="Copy Screenshot to Clipboard"
              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={handleToggleFullscreen}
              title="Toggle Fullscreen (F)"
              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Scrubber */}
          <div className="w-full max-w-5xl mt-6 px-4 z-40">
            <FrameScrubber
              frame={frame}
              maxFrames={maxFrames}
              disabled={isLockedViewer}
              onFrameChange={(f) => {
                setIsPlaying(false);
                setFrame(f);
              }}
              className="w-full bg-white/20 rounded-lg appearance-none cursor-pointer accent-[hsl(var(--accent-scope))]"
            />
            <div className="flex justify-between text-xs text-white/50 mt-2 timecode">
              <span>{String(frame).padStart(3, "0")}</span>
              <span>{maxFrames}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 mt-4">
            <PlaybackControls
              isPlaying={isPlaying}
              disabled={isLockedViewer}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              onStepBack={() => {
                setIsPlaying(false);
                setFrame(Math.max(1, frame - 1));
              }}
              onStepForward={() => {
                setIsPlaying(false);
                setFrame(Math.min(maxFrames, frame + 1));
              }}
              frame={frame}
              maxFrames={maxFrames}
              buttonClassName="text-white hover:bg-white/10"
              playButtonClassName="bg-accent-scope hover:bg-accent-scope/90 text-accent-scope-foreground w-12 h-12 rounded-full"
              iconClassName="w-5 h-5"
              playIconClassName="w-6 h-6"
              centerPlayIcon
            />
          </div>
        </div>

        {/* Right Sidebar: Feedback */}
        <div className="w-96 bg-zinc-950 border-l border-white/10 flex flex-col">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold mb-1">Feedback</h2>
            <p className="text-sm text-white/50">
              Provide notes for the studio on this version.
            </p>
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium">
                Add a note at frame{" "}
                <span className="timecode">
                  {String(frame).padStart(3, "0")}
                </span>
              </label>
              <Textarea
                placeholder="E.g. The lighting on the left looks a bit dark..."
                className="bg-zinc-900 border-white/10 text-white min-h-[120px] focus:ring-accent-scope"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <Button
                className="w-full bg-white/10 hover:bg-white/20 text-white"
                disabled={!feedback.trim()}
                onClick={() => {
                  if (!activeShot || !feedback.trim()) return;
                  // The author is stamped server-side from the redeemed
                  // access link (or the signed-in client account), never from
                  // anything sent here.
                  createClientNote.mutate(
                    {
                      versionId: activeVersionId ?? null,
                      frame,
                      text: feedback.trim(),
                      // Persist whatever markup is currently drawn on the
                      // frame alongside the note — otherwise the drawing
                      // vanishes and only the typed text survives into the
                      // review pipeline.
                      annotations:
                        annotations.length > 0 ? annotations : undefined,
                    },
                    {
                      onSuccess: () => {
                        // Clear the canvas now that this markup has been
                        // captured with the note, so the next note starts
                        // from a blank frame.
                        applyAnnotationsUpdate([]);
                        setSelectedAnnotationId(null);
                        setFeedback("");
                        toast({
                          title: "Note Added",
                          description:
                            "Sent to the studio for review — they’ll transfer it to the team once seen.",
                        });
                      },
                      onError: (err) =>
                        toast({
                          title: "Couldn't add note",
                          description:
                            err instanceof Error
                              ? err.message
                              : "Please try again.",
                          variant: "destructive",
                        }),
                    },
                  );
                }}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Add Note
              </Button>
            </div>

            {shotNotes.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-500 tracking-wide">
                  NOTES &amp; REPLIES
                </div>
                <AnimatePresence initial={false}>
                  {[...shotNotes].reverse().map((note) => (
                    <motion.div
                      key={note.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "rounded-lg border p-3",
                        note.authorRole === "staff"
                          ? "border-accent-scope/30 bg-accent-scope/5"
                          : "border-white/10 bg-zinc-900/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                          <User className="w-3 h-3 text-zinc-500" />
                          {note.authorRole === "staff"
                            ? `${note.authorName} (Studio)`
                            : note.authorName}
                        </span>
                        <span className="text-[10px] text-zinc-500 timecode">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-200 mb-2">{note.text}</p>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mb-2">
                        <span className="timecode">
                          Frame {String(note.frame).padStart(3, "0")}
                        </span>
                        {note.annotations && note.annotations.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-accent-scope/80 font-sans">
                            <PenTool className="w-3 h-3" />
                            {note.annotations.length}{" "}
                            {note.annotations.length === 1 ? "mark" : "marks"}
                          </span>
                        )}
                      </div>
                      {note.authorRole === "staff" ? (
                        <div className="inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded bg-accent-scope/10 text-accent-scope">
                          <Send className="w-3 h-3" />
                          Reply from the studio
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded",
                            note.transferred
                              ? "bg-status-green/10 text-status-green"
                              : "bg-status-orange/10 text-status-orange",
                          )}
                        >
                          {note.transferred ? (
                            <Send className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {note.transferred
                            ? "Seen by studio team"
                            : "Awaiting studio review"}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/10 bg-zinc-900/50">
            <div className="text-sm text-center mb-4 text-zinc-400">
              Final Decision
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleSubmit("changes_requested")}
              >
                <ThumbsDown className="w-4 h-4 mr-2" />
                Request Changes
              </Button>
              <Button
                className="flex-1 bg-accent-scope hover:bg-accent-scope/90 text-accent-scope-foreground"
                onClick={() => handleSubmit("approved")}
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
