import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  PROJECTS,
  USERS,
  TASKS,
  SHOTS,
  AUDIT_EVENTS,
  type Version,
} from "@/data/mockData";
import {
  ChevronLeft,
  Package,
  Film,
  ListTodo,
  GitBranch,
  Clock,
  Upload,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Download,
} from "lucide-react";
import { PipelineVisualizer } from "@/components/shared/PipelineVisualizer";
import { useToast } from "@/hooks/use-toast";
import { useReviewStore } from "@/store/reviews";
import { useAssetActivityStore } from "@/store/assetActivity";
import { useAssets, useUpdateAsset } from "@/hooks/useAssets";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { fadeInUp, confirmPulse } from "@/lib/motion";

/** USD (Universal Scene Description) is a scene/geometry interchange format —
 * it applies to modeled/rigged/effects assets, not to flat media like
 * textures or audio. The "USD Format" badge should only appear on versions
 * of asset types that actually publish through the USD pipeline. */
const USD_ASSET_TYPES = new Set([
  "Character",
  "Environment",
  "Prop",
  "Rig",
  "Effects",
  "Vehicle",
]);

/** Best-guess DCC app for an asset's type — there's no real desktop launch
 * behind this in a browser mock, but the mapping keeps the "Launching..."
 * toast honest rather than generic. */
function dccAppForAssetType(type: string): string {
  switch (type) {
    case "Character":
    case "Rig":
      return "Maya";
    case "Effects":
      return "Houdini";
    case "Texture":
    case "Material":
      return "Substance Painter";
    case "Audio":
      return "Pro Tools";
    default:
      return "Maya";
  }
}

function downloadVersionAsUSD(
  asset: { id: string; name: string },
  version: Version,
) {
  const content = [
    "#usda 1.0",
    "(",
    '    doc = "Forge mock USD export"',
    ")",
    "",
    `def Xform "${asset.name.replace(/\s+/g, "_")}"`,
    "{",
    `    custom string forge:assetId = "${asset.id}"`,
    `    custom string forge:version = "${version.versionNumber}"`,
    `    custom string forge:status = "${version.status}"`,
    `    custom string forge:notes = "${version.notes}"`,
    `    custom string forge:fileSize = "${version.fileSize}"`,
    `    custom string forge:exportedAt = "${new Date().toISOString()}"`,
    "}",
    "",
  ].join("\n");
  const blob = new Blob([content], { type: "model/vnd.usda;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${asset.name.replace(/\s+/g, "_")}_${version.versionNumber}.usda`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AssetDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/assets/:id");
  const [compareMode, setCompareMode] = useState(false);
  const [wipePos, setWipePos] = useState(50);
  const [v1, setV1] = useState<string | null>(null);
  const [v2, setV2] = useState<string | null>(null);

  const allVersions = useReviewStore((s) => s.versions);
  const currentVersionOverrides = useReviewStore(
    (s) => s.currentVersionOverrides,
  );
  const rollbackToVersion = useReviewStore((s) => s.rollbackToVersion);
  const { data: assets = [], isLoading } = useAssets();
  const updateAssetMutation = useUpdateAsset();
  const lastOpenedInDCC = useAssetActivityStore((s) => s.lastOpenedInDCC);
  const recordDccOpen = useAssetActivityStore((s) => s.recordDccOpen);
  const publishOverrides = useAssetActivityStore((s) => s.publishOverrides);
  const publishAsset = useAssetActivityStore((s) => s.publishAsset);
  const currentUser = useAuthStore((s) => s.currentUser);
  const setActiveTaskDrawer = useUIStore((s) => s.setActiveTaskDrawer);

  const asset = assets.find((a) => a.id === params?.id);

  // In-page links (e.g. a Dependency card below) can route from one asset's
  // detail page straight to another's without unmounting this component, so
  // compare-mode selections from the previous asset would otherwise leak
  // into the next one (stale version ids that don't belong to it).
  useEffect(() => {
    setCompareMode(false);
    setWipePos(50);
    setV1(null);
    setV2(null);
  }, [params?.id]);

  if (isLoading)
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading asset...
      </div>
    );
  if (!asset)
    return (
      <div className="p-6 text-center text-muted-foreground">
        Asset not found.
      </div>
    );

  const project = PROJECTS.find((p) => p.id === asset.projectId);
  const assignee = USERS.find((u) => u.id === asset.assigneeId);
  const relatedTasks = TASKS.filter((t) => t.assetId === asset.id).slice(0, 5);
  const relatedShots = SHOTS.filter((s) =>
    TASKS.some((t) => t.shotId === s.id && t.assetId === asset.id),
  ).slice(0, 5);
  const versions = allVersions
    .filter((v) => v.entityId === asset.id)
    .slice(0, 8);
  const events = AUDIT_EVENTS.filter((e) => e.entityId === asset.id).slice(
    0,
    10,
  );

  const deps = asset.dependencies
    .map((d) => assets.find((a) => a.id === d))
    .filter(Boolean);

  const currentVersionId = currentVersionOverrides[asset.id];
  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const displayVersionNumber = currentVersion?.versionNumber ?? asset.version;
  const dccOpen = lastOpenedInDCC[asset.id];
  const isUsdAsset = USD_ASSET_TYPES.has(asset.type);
  const publishRecord = publishOverrides[asset.id];
  const isPublished = asset.publishStatus === "published";

  const handleOpenInDCC = () => {
    const app = dccAppForAssetType(asset.type);
    recordDccOpen(asset.id, {
      app,
      userName: currentUser?.name ?? "You",
      timestamp: new Date().toISOString(),
    });
    toast({
      title: `Launching ${app}`,
      description: `Opening ${asset.name} (${displayVersionNumber}) in ${app}...`,
      duration: 2500,
    });
  };

  const handleRollback = (v: Version) => {
    rollbackToVersion(asset.id, v.id);
    toast({
      title: "Rolled Back",
      description: `${v.versionNumber} is now the current version of ${asset.name}.`,
      duration: 2000,
    });
  };

  const handleDownloadUSD = (v: Version) => {
    downloadVersionAsUSD(asset, v);
    toast({
      title: "Download Started",
      description: `${asset.name} ${v.versionNumber} (.usda) downloaded.`,
      duration: 2000,
    });
  };

  const handlePublish = () => {
    updateAssetMutation.mutate({ id: asset.id, publishStatus: "published" });
    publishAsset(asset.id, {
      userName: currentUser?.name ?? "You",
      timestamp: new Date().toISOString(),
    });
    toast({
      title: "Asset Published",
      description: `${asset.name} (${displayVersionNumber}) is now published.`,
      duration: 2000,
    });
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" asChild className="h-7 w-7">
          <Link href="/assets">
            <ChevronLeft className="w-4 h-4" />
          </Link>
        </Button>
        <Link
          href="/assets"
          className="hover:text-foreground transition-colors"
        >
          Assets
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{asset.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-6">
        <div className="w-48 h-32 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center shrink-0">
          <Package className="w-12 h-12 text-muted-foreground/30" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{asset.name}</h1>
            <Badge className="text-xs">{asset.type}</Badge>
            <Badge
              variant={asset.status === "complete" ? "default" : "secondary"}
              className="text-xs"
            >
              {asset.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mb-3">{asset.description}</p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Avatar className="w-5 h-5">
                <AvatarImage src={assignee?.avatar} />
                <AvatarFallback>{assignee?.name.charAt(0)}</AvatarFallback>
              </Avatar>
              {assignee?.name}
            </div>
            <span>
              Version:{" "}
              <span className="font-mono text-foreground">
                {displayVersionNumber}
              </span>
            </span>
            <span>Size: {asset.fileSize}</span>
            {asset.polyCount && <span>Polys: {asset.polyCount}</span>}
            <span>
              Project:{" "}
              <Link
                href={`/projects/${project?.id}`}
                className="text-primary hover:underline"
              >
                {project?.name}
              </Link>
            </span>
          </div>
          {dccOpen && (
            <motion.p
              key={dccOpen.timestamp}
              {...fadeInUp}
              className="text-xs text-muted-foreground mt-2"
            >
              Last opened in {dccOpen.app} by {dccOpen.userName} ·{" "}
              {new Date(dccOpen.timestamp).toLocaleString()}
            </motion.p>
          )}
          {publishRecord && (
            <motion.p
              key={publishRecord.timestamp}
              {...fadeInUp}
              className="text-xs text-muted-foreground mt-1"
            >
              Published by {publishRecord.userName} ·{" "}
              {new Date(publishRecord.timestamp).toLocaleString()}
            </motion.p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePublish}
            disabled={isPublished}
          >
            <Upload className="w-4 h-4 mr-1" />{" "}
            {isPublished ? "Published" : "Publish"}
          </Button>
          <Button size="sm" onClick={handleOpenInDCC}>
            Open in DCC
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">
            Versions ({versions.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({relatedTasks.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <Card className="border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.05)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Pipeline Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PipelineVisualizer tasks={relatedTasks} entityType="asset" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Dependencies */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitBranch className="w-4 h-4" /> Dependencies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deps.length > 0 ? (
                    deps.map(
                      (d) =>
                        d && (
                          <Link key={d.id} href={`/assets/${d.id}`}>
                            <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                              <Package className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                {d.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] ml-auto"
                              >
                                {d.status}
                              </Badge>
                            </div>
                          </Link>
                        ),
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No dependencies.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Related Shots */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Film className="w-4 h-4" /> Used in Shots
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {relatedShots.length > 0 ? (
                    relatedShots.map((s) => (
                      <Link key={s.id} href={`/shots/${s.id}`}>
                        <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/30 transition-colors">
                          <Film className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{s.name}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] ml-auto"
                          >
                            {s.status}
                          </Badge>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Not linked to any shots yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Tags & Metadata */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tags & Metadata</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {asset.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Created:</span>{" "}
                      {asset.updatedAt}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Publish Status:
                      </span>{" "}
                      <Badge variant="outline" className="text-xs">
                        {asset.publishStatus}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Publish Status */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Publish Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    {asset.publishStatus === "published" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : asset.publishStatus === "failed" ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-500" />
                    )}
                    <span className="font-medium capitalize">
                      {asset.publishStatus}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Target: production</div>
                    <div>Version: {displayVersionNumber}</div>
                    <div>Last updated: {asset.updatedAt}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          {versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center border border-dashed border-border rounded-lg">
              <GitBranch className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                No version history recorded for this asset yet
              </p>
              <p className="text-xs text-muted-foreground/70 max-w-sm">
                Publishes and uploads for {asset.name} will appear here once a
                version is submitted.
              </p>
            </div>
          ) : !compareMode ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCompareMode(true)}
                  disabled={versions.length < 2}
                >
                  <GitBranch className="w-4 h-4 mr-2" /> Compare Versions
                </Button>
              </div>
              <div className="space-y-3">
                {versions.map((v) => {
                  const isCurrent = currentVersionId
                    ? v.id === currentVersionId
                    : v.versionNumber === asset.version;
                  return (
                    <Card
                      key={v.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-20 h-12 rounded bg-muted flex items-center justify-center font-mono text-sm font-bold">
                          {v.versionNumber}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {v.notes}
                            </span>
                            <Badge
                              className={`text-[10px] ${v.status === "approved" ? "bg-green-500/10 text-green-500" : v.status === "rejected" ? "bg-red-500/10 text-red-500" : "bg-yellow-500/10 text-yellow-500"}`}
                            >
                              {v.status}
                            </Badge>
                            {isUsdAsset && (
                              <Badge
                                variant="outline"
                                className="text-[9px] uppercase border-indigo-500/30 text-indigo-400"
                              >
                                USD Format
                              </Badge>
                            )}
                            {isCurrent && (
                              <motion.span
                                key={`${v.id}-current`}
                                {...confirmPulse}
                              >
                                <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/30">
                                  Current
                                </Badge>
                              </motion.span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            by {USERS.find((u) => u.id === v.createdById)?.name}{" "}
                            · {new Date(v.createdAt).toLocaleDateString()} ·{" "}
                            {v.fileSize}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isCurrent}
                            onClick={() => handleRollback(v)}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />{" "}
                            {isCurrent ? "Current Version" : "Rollback"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadUSD(v)}
                          >
                            <Download className="w-4 h-4 mr-2" /> Download USD
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <select
                    className="h-9 px-3 rounded-md border border-border bg-background text-sm"
                    value={v1 || versions[0]?.id}
                    onChange={(e) => setV1(e.target.value)}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.versionNumber} - {v.notes}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground text-sm font-medium">
                    vs
                  </span>
                  <select
                    className="h-9 px-3 rounded-md border border-border bg-background text-sm"
                    value={v2 || versions[1]?.id}
                    onChange={(e) => setV2(e.target.value)}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.versionNumber} - {v.notes}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCompareMode(false)}
                >
                  Exit Compare
                </Button>
              </div>

              <div className="aspect-video relative rounded-lg border border-border overflow-hidden bg-muted">
                {/* Image A */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Package className="w-16 h-16 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground font-mono">
                      {
                        versions.find((v) => v.id === (v1 || versions[0]?.id))
                          ?.versionNumber
                      }
                    </p>
                  </div>
                </div>

                {/* Image B (Wiped) */}
                <div
                  className="absolute inset-0 flex items-center justify-center bg-card border-r-2 border-primary"
                  style={{ clipPath: `inset(0 ${100 - wipePos}% 0 0)` }}
                >
                  <div className="text-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Package className="w-16 h-16 text-primary/30 mx-auto mb-2" />
                    <p className="text-primary font-mono">
                      {
                        versions.find((v) => v.id === (v2 || versions[1]?.id))
                          ?.versionNumber
                      }
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 px-4">
                <span className="text-xs font-mono font-medium w-8">A</span>
                <Slider
                  value={[wipePos]}
                  onValueChange={([v]) => setWipePos(v)}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs font-mono font-medium w-8 text-right">
                  B
                </span>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="space-y-2">
            {relatedTasks.map((t) => (
              <Card
                key={t.id}
                className="hover:bg-muted/20 transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setActiveTaskDrawer(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTaskDrawer(t.id);
                  }
                }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <ListTodo className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {USERS.find((u) => u.id === t.assigneeId)?.name} · Due{" "}
                      {t.dueDate}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {t.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {t.priority}
                  </Badge>
                </CardContent>
              </Card>
            ))}
            {relatedTasks.length === 0 && (
              <Empty className="border-2 border-dashed border-border rounded-lg py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListTodo />
                  </EmptyMedia>
                  <EmptyTitle>No tasks yet</EmptyTitle>
                  <EmptyDescription>
                    No tasks are linked to this asset.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="space-y-3">
            {events.map((ev) => {
              const user = USERS.find((u) => u.id === ev.userId);
              return (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 p-3 rounded border border-border"
                >
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm">
                      <span className="font-medium">{user?.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {ev.description}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {ev.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No activity recorded.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
