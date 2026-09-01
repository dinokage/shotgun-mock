import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/apiClient";
import { PROJECTS, STUDIOS, VERSIONS } from "@/data/mockData";
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
import { useReviewStore, PRESENTED_VERSION_ID } from "@/store/reviews";
import { useShotStore } from "@/store/shots";
import { useBroadcastsStore } from "@/store/broadcasts";
import { cn } from "@/lib/utils";
import {
  getPlaceholderThumbnail,
  getPlaceholderVideoSrc,
} from "@/lib/placeholderArt";
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
function resolveThumbnailSeed(shot: {
  id: string;
  currentVersion: string;
  thumbnailSeed: number;
}): number {
  const currentVersionRecord = VERSIONS.find(
    (v) =>
      v.entityType === "shot" &&
      v.entityId === shot.id &&
      v.versionNumber === shot.currentVersion,
  );
  return currentVersionRecord?.thumbnailSeed ?? shot.thumbnailSeed;
}

function resolveShotVideoSrc(shot: {
  id: string;
  currentVersion: string;
  thumbnailSeed: number;
}): string {
  return getPlaceholderVideoSrc(resolveThumbnailSeed(shot));
}

export default function ClientReview() {
  const { currentUser, logout } = useAuthStore();
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const hasToken = searchParams.get("token") === "demo";

  const [accessCode, setAccessCode] = useState("");
  const [clientAuthenticated, setClientAuthenticated] = useState(hasToken);
  // Set once an access code is successfully redeemed against the real
  // POST /client-access/redeem route below — null for the legacy bypass
  // paths (an explicit-'client'-role user, or the ?token=demo shortcut)
  // that never redeem a link, in which case this page keeps its prior
  // unscoped behavior. When set, it scopes what this page requests to the
  // redeemed link's granted project/episode/version (see pendingReviews
  // below) — client-side only; full server-side enforcement of this scope
  // is a later task's responsibility.
  const [clientScope, setClientScope] = useState<{
    projectId: string | null;
    episodeId: string | null;
    versionId: string | null;
  } | null>(null);

  // If a user has the explicit 'client' role, they automatically bypass the access code.
  // Otherwise, everyone (even managers testing the portal) must enter the access code.
  const isExplicitClient = currentUser?.role === "client";

  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

  const [tool, setTool] = useState<AnnotationTool>("select");
  const [color, setColor] = useState("#10b981");
  // Annotations are persisted server-side, keyed to the version currently
  // being reviewed (PRESENTED_VERSION_ID — the same id review.tsx uses for
  // this concept, and the one this page already imports for Presentation
  // Mode's lock check above).
  const { data: annotations = [] } = useAnnotations(PRESENTED_VERSION_ID);
  const createAnnotation = useCreateAnnotation(PRESENTED_VERSION_ID);
  const updateAnnotation = useUpdateAnnotation(PRESENTED_VERSION_ID);
  const deleteAnnotation = useDeleteAnnotation(PRESENTED_VERSION_ID);
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
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [ghosting, setGhosting] = useState(false);
  const [draggingElement, setDraggingElement] =
    useState<DraggingElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const maxFrames = 240;

  // Presentation Mode: when an internal reviewer is presenting the version
  // the client is looking at, this viewer's playhead is locked to theirs and
  // the only actions available collapse down to Approve / Request Changes —
  // which is already the entirety of this portal's decision actions.
  const presentation = useReviewStore((s) => s.presentation);
  const isLockedViewer =
    presentation.isActive &&
    presentation.versionId === PRESENTED_VERSION_ID &&
    presentation.presenterId !== currentUser?.id;

  // Pending client reviews — sourced from the persisted shot store (not the
  // static SHOTS import) so an Approve/Request Changes decision below is
  // reflected here immediately, and stays reflected across reloads.
  const shots = useShotStore((s) => s.shots);
  const updateReviewStatus = useShotStore((s) => s.updateReviewStatus);
  const updateShot = useShotStore((s) => s.updateShot);
  // Scoped to the redeemed access link's grant (see clientScope above), most
  // specific field first — a versionId grant limits to that single shot's
  // delivered version, an episodeId grant to that episode's shots, a
  // projectId grant to that project's shots. clientScope is null for the
  // legacy bypass paths, which keep seeing every pending review as before.
  const pendingReviews = shots
    .filter((s) => s.status === "client-review")
    .filter((s) => {
      if (!clientScope) return true;
      if (clientScope.versionId) {
        const scopedVersion = VERSIONS.find(
          (v) => v.id === clientScope.versionId,
        );
        return scopedVersion ? scopedVersion.entityId === s.id : false;
      }
      if (clientScope.episodeId) return s.episodeId === clientScope.episodeId;
      if (clientScope.projectId) return s.projectId === clientScope.projectId;
      return true;
    });
  const activeShot = activeReviewId
    ? shots.find((s) => s.id === activeReviewId)
    : null;
  const activeProject = activeShot
    ? PROJECTS.find((p) => p.id === activeShot.projectId)
    : null;
  const activeStudio = activeProject
    ? STUDIOS.find((s) => s.id === activeProject.studioId)
    : null;

  // Studio Updates: the one bridge from the internal status-broadcast
  // feature into this external, unauthenticated portal — a producer/manager
  // marks a broadcast 'internal_and_client' and scopes it to this project.
  // Filtered + sorted defensively (store already prepends newest-first) and
  // capped at 3; renders nothing when empty so a client is never shown an
  // empty state for an internal feature they don't otherwise know exists.
  const broadcasts = useBroadcastsStore((s) => s.broadcasts);
  const studioUpdates = useMemo(
    () =>
      broadcasts
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
    [broadcasts, activeProject],
  );

  // Deterministic render-preview art for the player's video area, so there's
  // always something on screen before playback starts (or if it never does).
  const activeVersionPoster = useMemo(
    () =>
      activeShot
        ? getPlaceholderThumbnail(resolveThumbnailSeed(activeShot), 1280, 720)
        : undefined,
    [activeShot],
  );

  // Real per-shot media reference for playback, instead of one hardcoded
  // clip shared by every shot regardless of which one was clicked.
  const activeVideoSrc = useMemo(
    () => (activeShot ? resolveShotVideoSrc(activeShot) : undefined),
    [activeShot],
  );

  // Client feedback moderation: notes submitted here are held pending until
  // an internal reviewer explicitly transfers them into the team comment
  // stream — they never become visible internally by default.
  const clientNotes = useReviewStore((s) => s.clientNotes);
  const addClientNote = useReviewStore((s) => s.addClientNote);
  const shotNotes = activeShot
    ? clientNotes.filter((n) => n.shotId === activeShot.id)
    : [];

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

  const handleSubmit = (action: "approved" | "changes_requested") => {
    if (activeShot) {
      // Persist the real decision: the shot's clientReviewStatus (the
      // review-pipeline record) and its overall status (what takes it out of
      // "Awaiting Review" on this dashboard and on the producer home page,
      // both of which filter on status === 'client-review').
      updateReviewStatus(
        activeShot.id,
        false,
        action === "approved" ? "approved" : "changes-requested",
      );
      updateShot(activeShot.id, {
        status: action === "approved" ? "approved" : "in-progress",
      });
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
            {/* This is a mock with no real email-delivery system behind the
                access code, so unlike a real product there is no other way
                to learn it. Stated plainly here instead of disguised inside
                the input's placeholder (which read the code out to anyone
                who focused the field, without even needing to submit). */}
            <p className="text-xs text-center text-muted-foreground/70 border-t border-border/50 pt-3 mt-2">
              Demo mode — access code is{" "}
              <span className="font-mono text-foreground/80">demo</span>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // DASHBOARD VIEW
  if (!activeReviewId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
        <header className="h-16 px-8 flex items-center justify-between border-b border-white/10 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <div className="w-4 h-4 bg-card rounded-sm" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-lg tracking-tight">
                Forge Client Portal
              </div>
              <div className="text-[11px] text-zinc-500">
                External review — no studio login required
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              className="border-status-green/30 text-status-green bg-status-green/10 gap-1.5"
            >
              <Lock className="w-3 h-3" /> Secure Connection
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" /> Exit
            </Button>
          </div>
        </header>

        <main className="p-8 max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Pending Reviews
            </h1>
            <p className="text-zinc-400 mt-2 text-sm">
              Please review the following deliveries and provide your feedback
              or approval.
            </p>
          </div>

          {pendingReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border border-white/5 rounded-xl bg-zinc-900/20">
              <CheckCircle2 className="w-16 h-16 text-status-green mb-4 opacity-50" />
              <h3 className="text-xl font-semibold">All Caught Up!</h3>
              <p className="text-zinc-500">
                There are no pending reviews at this time.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingReviews.map((shot) => {
                const project = PROJECTS.find((p) => p.id === shot.projectId);
                const studio = project
                  ? STUDIOS.find((s) => s.id === project.studioId)
                  : null;
                return (
                  <div
                    key={shot.id}
                    className="group bg-zinc-900 border border-white/10 rounded-xl overflow-hidden hover:border-accent-scope/50 hover:shadow-[0_0_20px_hsl(var(--accent-scope)/0.15)] transition-all cursor-pointer flex flex-col"
                    onClick={() => setActiveReviewId(shot.id)}
                  >
                    <div
                      className="relative aspect-video bg-zinc-800 overflow-hidden bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${getPlaceholderThumbnail(resolveThumbnailSeed(shot))})`,
                      }}
                    >
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-12 h-12 text-white drop-shadow-md" />
                      </div>
                      {studio && (
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-md text-[11px] font-medium text-zinc-100 border border-white/10">
                          <Building2 className="w-3 h-3 text-zinc-300" />
                          <span>{studio.name}</span>
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
          {activeStudio && (
            <div className="flex items-center gap-2 pr-4 border-r border-white/10 text-xs text-white/60">
              <Building2 className="w-4 h-4 text-white/40" />
              <span>
                Delivered by{" "}
                <span className="text-white font-medium">
                  {activeStudio.name}
                </span>
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
                    {activeStudio?.name || "Studio"}
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
        <div className="flex-1 relative flex flex-col items-center justify-center p-4">
          <div
            className="relative w-full max-w-5xl aspect-video bg-zinc-900 bg-cover bg-center rounded-lg overflow-hidden shadow-2xl border border-white/5"
            style={{ backgroundImage: `url(${activeVersionPoster})` }}
          >
            <video
              key={activeShot?.id}
              ref={videoRef}
              src={activeVideoSrc}
              poster={activeVersionPoster}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              muted
              playsInline
            />

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
              selectionRingClassName="border-emerald-500 ring-2 ring-emerald-500/50"
              ghosting={ghosting}
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
                  addClientNote({
                    shotId: activeShot.id,
                    shotName: activeShot.name,
                    frame,
                    text: feedback.trim(),
                    authorName: currentUser?.name || "Client Reviewer",
                    // Persist whatever markup is currently drawn on the frame
                    // alongside the note — otherwise the drawing vanishes and
                    // only the typed text survives into the review pipeline.
                    annotations:
                      annotations.length > 0 ? annotations : undefined,
                  });
                  // Clear the canvas now that this markup has been captured
                  // with the note, so the next note starts from a blank frame.
                  applyAnnotationsUpdate([]);
                  setSelectedAnnotationId(null);
                  setFeedback("");
                  toast({
                    title: "Note Added",
                    description:
                      "Sent to the studio for review — they’ll transfer it to the team once seen.",
                  });
                }}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Add Note
              </Button>
            </div>

            {shotNotes.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-500 tracking-wide">
                  YOUR NOTES
                </div>
                <AnimatePresence initial={false}>
                  {shotNotes.map((note) => (
                    <motion.div
                      key={note.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-lg border border-white/10 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                          <User className="w-3 h-3 text-zinc-500" />
                          {note.authorName}
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
