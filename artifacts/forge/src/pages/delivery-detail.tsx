import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  ShieldCheck,
  Lock,
  Key,
  Download,
  Play,
  Ban,
  Clock,
  ArrowLeft,
  PackageX,
  Package,
  Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth";
import {
  useDeliveryStore,
  isDeliveryActive,
  isDeliveryExpired,
  type Delivery,
} from "@/store/deliveries";
import { useProjectStore } from "@/store/projects";
import { useShotStore } from "@/store/shots";
import {
  getPlaceholderThumbnail,
  getPlaceholderVideoSrc,
} from "@/lib/placeholderArt";
import { cn } from "@/lib/utils";

/**
 * Presentational-only countdown label derived from the delivery's existing
 * `expiresAt` field. This is purely a friendlier rendering of a value that's
 * already there — it does not affect `isDeliveryActive`/`isDeliveryExpired`
 * (store/deliveries.ts), which remain the sole source of truth for whether
 * the link still actually works.
 */
function formatExpiryCountdown(expiresAt: string): {
  label: string;
  urgent: boolean;
} {
  const msRemaining = new Date(expiresAt).getTime() - Date.now();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  if (daysRemaining <= 1)
    return { label: "Access expires today", urgent: true };
  if (daysRemaining <= 3)
    return { label: `Access expires in ${daysRemaining} days`, urgent: true };
  return { label: `Access expires in ${daysRemaining} days`, urgent: false };
}

/** Small Forge brand mark, matching the real logo used in TopBar/login.tsx
 * (a primary-colored square with an inset card-colored square) — used here
 * instead of ad hoc styling so the client-facing gate/expired states still
 * read as unmistakably Forge. */
function ForgeMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-primary rounded-lg flex items-center justify-center shrink-0",
        className,
      )}
    >
      <div className="w-[45%] h-[45%] bg-card rounded-sm" />
    </div>
  );
}

/** Shared identity strip (title / project / client) shown above the access
 * gate and the expired/revoked states so a client always knows what they're
 * unlocking (or what they've lost access to) before anything else on screen. */
function DeliveryMasthead({
  delivery,
  projectName,
}: {
  delivery: Delivery;
  projectName: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5 text-center flex-col">
      <ForgeMark className="w-8 h-8" />
      <div>
        <div className="font-semibold text-white">{delivery.title}</div>
        <div className="text-xs text-zinc-500">
          {projectName ?? delivery.projectId} • {delivery.clientName}
        </div>
      </div>
    </div>
  );
}

export default function DeliveryDetail() {
  const [, params] = useRoute("/delivery/:id");
  const [, setLocation] = useLocation();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  const deliveries = useDeliveryStore((s) => s.deliveries);
  const recordAccess = useDeliveryStore((s) => s.recordAccess);
  const projects = useProjectStore((s) => s.projects);
  const shots = useShotStore((s) => s.shots);

  const delivery = deliveries.find((d) => d.id === params?.id);
  const project = delivery
    ? projects.find((p) => p.id === delivery.projectId)
    : undefined;

  const [accessCode, setAccessCode] = useState("");
  // Any authenticated internal user (staff already inside Forge) skips the
  // access-code gate — the gate exists for external recipients who have no
  // Forge login at all, not to re-authenticate people already signed in.
  const [unlocked, setUnlocked] = useState(!!currentUser);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);

  if (!delivery) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 gap-4 p-4">
        <ForgeMark className="w-8 h-8" />
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <PackageX className="w-10 h-10 text-muted-foreground" />
          <div>
            <h1 className="text-white font-semibold">
              This delivery link doesn't exist
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              It may have been mistyped, or the delivery it pointed to was
              removed. Contact the studio if you believe this is a mistake.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation(currentUser ? "/delivery" : "/login")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />{" "}
          {currentUser ? "Back to Deliveries" : "Back to Login"}
        </Button>
      </div>
    );
  }

  const active = isDeliveryActive(delivery);

  const handleUnlock = () => {
    if (accessCode.trim().toLowerCase() === delivery.accessCode.toLowerCase()) {
      setUnlocked(true);
    } else {
      toast({
        title: "Invalid Code",
        description: "Check the access code you were sent.",
        variant: "destructive",
      });
    }
  };

  if (!unlocked) {
    const expiryHint =
      delivery.expiresAt && isDeliveryActive(delivery)
        ? formatExpiryCountdown(delivery.expiresAt)
        : null;
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 p-4 gap-6">
        <DeliveryMasthead delivery={delivery} projectName={project?.name} />
        <Card className="w-full max-w-md border-border/50 shadow-2xl">
          <CardHeader className="space-y-2 text-center pb-6">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Forge Delivery</CardTitle>
            <CardDescription>
              Enter the access code you were sent to view this delivery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Access code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
              }}
              className="text-center text-lg tracking-widest h-12"
            />
            <Button
              className="w-full h-12 text-md font-semibold"
              onClick={handleUnlock}
            >
              Unlock Delivery
            </Button>
            {expiryHint && (
              <p
                className={cn(
                  "text-xs text-center flex items-center justify-center gap-1.5 pt-2",
                  expiryHint.urgent
                    ? "text-status-orange"
                    : "text-muted-foreground",
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                {expiryHint.label} —{" "}
                <span className="timecode">
                  {new Date(delivery.expiresAt!).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!active) {
    const expired = isDeliveryExpired(delivery);
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-950 text-white gap-6 p-4">
        <DeliveryMasthead delivery={delivery} projectName={project?.name} />
        <Card className="w-full max-w-md border-border/50 shadow-2xl">
          <CardHeader className="space-y-2 text-center pb-6">
            <div
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2",
                expired ? "bg-status-orange/10" : "bg-status-red/10",
              )}
            >
              {expired ? (
                <Clock className="w-6 h-6 text-status-orange" />
              ) : (
                <Ban className="w-6 h-6 text-status-red" />
              )}
            </div>
            <CardTitle className="text-xl font-bold">
              {expired
                ? "This delivery link has expired"
                : "This delivery link has been disabled"}
            </CardTitle>
            <CardDescription className="max-w-sm mx-auto">
              {expired ? (
                <>
                  Access closed automatically{" "}
                  {delivery.expiresAt && (
                    <>
                      on{" "}
                      <span className="timecode text-foreground/80">
                        {new Date(delivery.expiresAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </span>{" "}
                    </>
                  )}
                  to keep the files scoped to the review window. The files
                  themselves haven't changed — you just need a fresh link.
                </>
              ) : (
                "The studio turned off access to this link. This usually just means a newer version is on its way."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-center text-muted-foreground">
              Contact{" "}
              <span className="text-foreground font-medium">
                {delivery.createdByName}
              </span>{" "}
              at the studio for a new link.
            </p>
          </CardContent>
        </Card>
        {currentUser && (
          <Button variant="outline" onClick={() => setLocation("/delivery")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Deliveries
          </Button>
        )}
      </div>
    );
  }

  const activeShot = activeShotId
    ? shots.find((s) => s.id === activeShotId)
    : null;
  const activeItem = activeShotId
    ? delivery.items.find((i) => i.shotId === activeShotId)
    : null;

  const handleDownloadManifest = () => {
    const lines = [
      "FORGE DELIVERY MANIFEST",
      "========================",
      `Delivery: ${delivery.title}`,
      `Project: ${project?.name ?? delivery.projectId}`,
      `Client: ${delivery.clientName}`,
      `Delivered by: ${delivery.createdByName}`,
      `Created: ${new Date(delivery.createdAt).toLocaleString()}`,
      `Expires: ${delivery.expiresAt ? new Date(delivery.expiresAt).toLocaleString() : "No expiry"}`,
      delivery.notes ? `Notes: ${delivery.notes}` : "",
      "",
      `Contents (${delivery.items.length} shot${delivery.items.length === 1 ? "" : "s"}):`,
      ...delivery.items.map(
        (item, i) => `  ${i + 1}. ${item.name} (${item.shotId})`,
      ),
      "",
      "This manifest documents the package contents. Individual shots are",
      'reviewable in the Forge player via "Preview" — this mock has no real',
      "render/transcode pipeline behind it, so no binary media file is",
      "attached to this download.",
    ].filter(Boolean);

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${delivery.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_manifest.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    recordAccess(delivery.id);
    toast({
      title: "Manifest Downloaded",
      description: `Package contents for "${delivery.title}" saved.`,
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {currentUser && (
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white shrink-0"
              onClick={() => setLocation("/delivery")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <ForgeMark className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold truncate">{delivery.title}</div>
            <div className="text-xs text-zinc-400 truncate flex items-center gap-1.5">
              <Building2 className="w-3 h-3 shrink-0 text-zinc-500" />
              {project?.name} • Delivered to {delivery.clientName} by{" "}
              {delivery.createdByName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {delivery.expiresAt ? (
            (() => {
              const expiryInfo = formatExpiryCountdown(delivery.expiresAt);
              return (
                <Badge
                  variant="outline"
                  className={cn(
                    "hidden sm:inline-flex gap-1.5 timecode font-normal",
                    expiryInfo.urgent
                      ? "border-status-orange/30 text-status-orange bg-status-orange/10"
                      : "border-status-green/30 text-status-green bg-status-green/10",
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {expiryInfo.label}
                </Badge>
              );
            })()
          ) : (
            <Badge
              variant="outline"
              className="hidden sm:inline-flex gap-1.5 font-normal border-white/10 text-zinc-400"
            >
              <ShieldCheck className="w-3 h-3" /> No expiry set
            </Badge>
          )}
          <Button
            variant="outline"
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
            onClick={handleDownloadManifest}
          >
            <Download className="w-4 h-4 mr-2" /> Download Manifest
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Lock className="w-3 h-3" /> Secure delivery link — access code
          required, not tied to a Forge account
        </div>

        {delivery.notes && (
          <div className="text-sm text-zinc-300 bg-white/5 border border-white/10 rounded-lg p-4">
            {delivery.notes}
          </div>
        )}

        {activeShot ? (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white -ml-2"
              onClick={() => setActiveShotId(null)}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to package
            </Button>
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/10 relative">
              <video
                key={activeShot.id}
                src={getPlaceholderVideoSrc(activeShot.thumbnailSeed)}
                poster={getPlaceholderThumbnail(
                  activeShot.thumbnailSeed,
                  1280,
                  720,
                )}
                controls
                autoPlay
                className="w-full h-full"
              />
              {/* Visible on-screen watermark, rendered in the browser — not
                  encoded/burned into the video itself, and not a forensic or
                  tamper-resistant watermark. It can be hidden or removed by
                  anyone with browser devtools access; it identifies who this
                  link was shared with, it doesn't prevent redistribution. */}
              <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden opacity-30 mix-blend-overlay">
                <div className="absolute top-1/4 left-1/4 -rotate-12 whitespace-nowrap text-white font-mono text-3xl font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                  {delivery.clientName}
                </div>
                <div className="absolute bottom-1/4 right-1/4 -rotate-12 whitespace-nowrap text-white font-mono text-3xl font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                  DO NOT DISTRIBUTE
                </div>
              </div>
            </div>
            <div className="text-sm font-medium">
              {activeItem?.name ?? activeShot.name}
            </div>
          </div>
        ) : delivery.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package />
              </EmptyMedia>
              <EmptyTitle>No files in this delivery</EmptyTitle>
              <EmptyDescription>
                This package doesn't contain any shots yet. Check back after the
                studio adds content.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {delivery.items.map((item) => (
              <div
                key={item.shotId}
                className="group bg-zinc-900 border border-white/10 rounded-lg overflow-hidden hover:border-primary/50 transition-all cursor-pointer"
                onClick={() => setActiveShotId(item.shotId)}
              >
                <div
                  className="relative aspect-video bg-zinc-800 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${getPlaceholderThumbnail(item.thumbnailSeed)})`,
                  }}
                >
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-10 h-10 text-white drop-shadow-md" />
                  </div>
                </div>
                <div className="p-3 text-sm font-medium truncate">
                  {item.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
