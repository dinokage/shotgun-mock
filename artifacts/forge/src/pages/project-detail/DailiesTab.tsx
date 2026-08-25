import { useEffect, useState } from "react";
import {
  PlayCircle,
  Download,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { USERS, type Shot } from "@/data/mockData";
import { useShotStore } from "@/store/shots";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlaybackControls } from "@/components/shared/review/PlaybackControls";
import { useToast } from "@/hooks/use-toast";

const THEATER_MAX_FRAMES = 100;

export default function DailiesTab({ project }: { project: any }) {
  const shots = useShotStore((state) => state.shots);
  const updateReviewStatus = useShotStore((state) => state.updateReviewStatus);
  const projectShots = shots.filter((s) => s.projectId === project.id);
  const { toast } = useToast();

  // Index into projectShots for the theater lightbox; null = closed.
  const [theaterIndex, setTheaterIndex] = useState<number | null>(null);
  const activeShot = theaterIndex !== null ? projectShots[theaterIndex] : null;

  const handleApprove = (shot: Shot) => {
    updateReviewStatus(shot.id, true, "approved");
    toast({
      title: "Dailies Approved",
      description: `${shot.name} marked approved in internal review.`,
    });
  };

  const handleReject = (shot: Shot) => {
    updateReviewStatus(shot.id, true, "rejected");
    toast({
      title: "Dailies Rejected",
      description: `${shot.name} marked rejected in internal review.`,
      variant: "destructive",
    });
  };

  const handleDownload = (shot: Shot) => {
    const assignee = USERS.find((u) => u.id === shot.assigneeId);
    const manifest = [
      `Shot: ${shot.name}`,
      `Sequence: ${shot.sequence}`,
      `Version: ${shot.usdVersion || "v001"}`,
      `Status: ${shot.status}`,
      `Frame Range: ${shot.frameRange}`,
      `Assignee: ${assignee?.name || "Unassigned"}`,
      `Internal Review: ${shot.internalReviewStatus}`,
      `Downloaded: ${new Date().toISOString()}`,
    ].join("\n");
    const blob = new Blob([manifest], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${shot.name}_${shot.usdVersion || "v001"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Download Started",
      description: `${shot.name} dailies manifest downloaded.`,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Dailies & Previews</h2>
          <p className="text-sm text-muted-foreground">
            Review playblasts and rendered frames for this project.
          </p>
        </div>
        <Button
          size="sm"
          disabled={projectShots.length === 0}
          onClick={() => setTheaterIndex(0)}
        >
          <PlayCircle className="w-4 h-4 mr-2" /> Play All in Theater
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {projectShots.map((shot, index) => {
          const assignee = USERS.find((u) => u.id === shot.assigneeId);
          // Deterministic thumbnail based on shot ID
          const thumbSeed = shot.id
            .split("")
            .reduce((a, b) => a + b.charCodeAt(0), 0);

          return (
            <Card
              key={shot.id}
              className="overflow-hidden group hover:shadow-md transition-all border-border"
            >
              <div className="relative aspect-video bg-muted group-hover:opacity-90 transition-opacity">
                <img
                  src={`https://picsum.photos/seed/${thumbSeed}/640/360`}
                  alt={shot.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-full w-12 h-12 shadow-xl"
                    onClick={() => setTheaterIndex(index)}
                    aria-label={`Play ${shot.name}`}
                  >
                    <PlayCircle className="w-6 h-6 ml-1" />
                  </Button>
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <Badge className="bg-black/60 text-white border-none font-mono text-[10px]">
                    {shot.usdVersion || "v001"}
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold">{shot.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {shot.sequence}
                    </div>
                  </div>
                  <StatusBadge status={shot.status} />
                </div>

                <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  <span className="flex items-center gap-1.5 truncate">
                    <img
                      src={assignee?.avatar}
                      alt=""
                      className="w-4 h-4 rounded-full"
                    />
                    {assignee?.name || "Unassigned"}
                  </span>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                      aria-label={`Approve ${shot.name}`}
                      onClick={() => handleApprove(shot)}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      aria-label={`Reject ${shot.name}`}
                      onClick={() => handleReject(shot)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={`Download ${shot.name}`}
                      onClick={() => handleDownload(shot)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={theaterIndex !== null}
        onOpenChange={(open) => !open && setTheaterIndex(null)}
      >
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {activeShot
              ? `Theater playback: ${activeShot.name}`
              : "Theater playback"}
          </DialogTitle>
          {activeShot && (
            <TheaterPlayer
              shot={activeShot}
              hasPrev={theaterIndex !== null && theaterIndex > 0}
              hasNext={
                theaterIndex !== null && theaterIndex < projectShots.length - 1
              }
              onPrev={() =>
                setTheaterIndex((i) => (i !== null ? Math.max(0, i - 1) : i))
              }
              onNext={() =>
                setTheaterIndex((i) =>
                  i !== null ? Math.min(projectShots.length - 1, i + 1) : i,
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Lightweight theater/lightbox player used for both the per-thumbnail play
// overlay and "Play All in Theater". Reuses the shared transport control
// (see review.tsx / delivery.tsx) driving a simulated frame counter with a
// real requestAnimationFrame play/pause loop, since there's no real video
// asset behind the mock dailies thumbnails.
function TheaterPlayer({
  shot,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  shot: Shot;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const assignee = USERS.find((u) => u.id === shot.assigneeId);
  const thumbSeed = shot.id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);

  // Reset playback state whenever the shot being previewed changes.
  useEffect(() => {
    setFrame(1);
    setIsPlaying(false);
  }, [shot.id]);

  useEffect(() => {
    let animationFrameId: number;
    if (isPlaying) {
      const loop = () => {
        setFrame((f) => {
          if (f >= THEATER_MAX_FRAMES) {
            setIsPlaying(false);
            return f;
          }
          return f + 1;
        });
        animationFrameId = requestAnimationFrame(loop);
      };
      animationFrameId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  return (
    <>
      <div className="relative aspect-video bg-black">
        <img
          src={`https://picsum.photos/seed/${thumbSeed}/1280/720`}
          alt={shot.name}
          className="w-full h-full object-contain"
        />
        <div className="absolute top-3 right-3 text-white font-mono text-xs bg-black/60 px-2 py-1 rounded">
          {String(frame).padStart(3, "0")} / {THEATER_MAX_FRAMES}
        </div>
        {hasPrev && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full shadow-xl"
            onClick={onPrev}
            aria-label="Previous shot"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        {hasNext && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full shadow-xl"
            onClick={onNext}
            aria-label="Next shot"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        )}
      </div>
      <div className="p-4 border-t border-border flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold truncate">{shot.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <img
              src={assignee?.avatar}
              alt=""
              className="w-4 h-4 rounded-full"
            />
            {shot.sequence} · {shot.usdVersion || "v001"} ·{" "}
            {assignee?.name || "Unassigned"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PlaybackControls
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onStepBack={() => {
              setIsPlaying(false);
              setFrame((f) => Math.max(1, f - 1));
            }}
            onStepForward={() => {
              setIsPlaying(false);
              setFrame((f) => Math.min(THEATER_MAX_FRAMES, f + 1));
            }}
            frame={frame}
            maxFrames={THEATER_MAX_FRAMES}
          />
          <StatusBadge status={shot.status} />
        </div>
      </div>
    </>
  );
}

// Temporary Badge component to avoid importing full UI library
function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`px-2 py-0.5 rounded-sm ${className}`}>{children}</span>
  );
}
