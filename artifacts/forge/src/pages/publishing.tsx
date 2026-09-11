import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Package,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCapability } from "@/hooks/use-capability";
import {
  usePublishLogs,
  useCreatePublishLog,
  type PublishKind,
  type PublishStatus,
  type PublishValidationEntry,
} from "@/hooks/usePublishLogs";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

const STATUS_CONFIG: Record<
  PublishStatus,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  success: {
    icon: CheckCircle2,
    color: "text-green-500",
    bg: "bg-green-500/10",
    label: "Published",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    label: "Failed",
  },
  validating: {
    icon: Loader2,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    label: "Validating",
  },
  queued: {
    icon: Clock,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    label: "Queued",
  },
};

export default function Publishing() {
  const [tab, setTab] = useState("queue");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: publishLogs = [] } = usePublishLogs();
  const createPublishLog = useCreatePublishLog();
  const { data: shots = [] } = useShots();
  const { data: assets = [] } = useAssets();
  const canPublish = useCapability("edit_tasks");

  // The publish target has to be a shot or asset that actually exists in this
  // tenant -- the server rejects anything else, so the dialog picks from the
  // real entity list rather than accepting a typed-in name.
  const entityOptions = useMemo(
    () => [
      ...shots.map((s) => ({ key: `shot:${s.id}`, id: s.id, name: s.name, kind: "shot" as PublishKind })),
      ...assets.map((a) => ({ key: `asset:${a.id}`, id: a.id, name: a.name, kind: "asset" as PublishKind })),
    ],
    [shots, assets],
  );

  const queue = publishLogs.filter(
    (p) => p.status === "queued" || p.status === "validating",
  );
  const recent = publishLogs.filter(
    (p) => p.status === "success" || p.status === "failed",
  );
  const successRate =
    publishLogs.length > 0
      ? Math.round(
          (publishLogs.filter((p) => p.status === "success").length /
            publishLogs.length) *
            100,
        )
      : 0;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const publishedLast24h = publishLogs.filter(
    (p) =>
      p.status === "success" &&
      Date.now() - new Date(p.publishedAt).getTime() <= oneDayMs,
  ).length;

  const [entityKey, setEntityKey] = useState("");
  const [versionNoteInput, setVersionNoteInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<
    {
      name: string;
      status: "pending" | "passed" | "failed" | "running";
      detail: string;
    }[]
  >([]);

  const selectedEntity = entityOptions.find((o) => o.key === entityKey) ?? null;

  const startValidation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity) return;
    setIsValidating(true);

    const trimmedNote = versionNoteInput.trim();

    // Real checks against the actual selection, not hardcoded pass results.
    const namingValid = /^[A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(selectedEntity.name);
    const noteValid = trimmedNote.length >= 10;
    const hasConflict = publishLogs.some(
      (p) =>
        p.entityId === selectedEntity.id &&
        (p.status === "queued" || p.status === "validating"),
    );

    const checks = [
      {
        name: "Naming Convention",
        status: "running" as const,
        detail: namingValid
          ? `"${selectedEntity.name}" matches the required prefix_name pattern.`
          : `"${selectedEntity.name}" does not match the required prefix_name pattern (letters/numbers, underscore-separated, no spaces).`,
      },
      {
        name: "Version Note",
        status: "pending" as const,
        detail: noteValid
          ? `Note has ${trimmedNote.length} characters of detail.`
          : `Note is too short (${trimmedNote.length} chars) — describe what changed in at least 10 characters.`,
      },
      {
        name: "No Conflicting In-Flight Publish",
        status: "pending" as const,
        detail: hasConflict
          ? `Another publish for "${selectedEntity.name}" is already queued or validating.`
          : `No conflicting publish currently in the queue for "${selectedEntity.name}".`,
      },
    ];
    setValidationResults(checks);

    const outcomes = [namingValid, noteValid, !hasConflict];

    // Steps still run in sequence so the UI reads as a pipeline, but the
    // pass/fail outcome for each step is decided above from real input.
    setTimeout(() => {
      setValidationResults((prev) => [
        { ...prev[0], status: outcomes[0] ? "passed" : "failed" },
        { ...prev[1], status: "running" },
        prev[2],
      ]);
    }, 800);

    setTimeout(() => {
      setValidationResults((prev) => [
        prev[0],
        { ...prev[1], status: outcomes[1] ? "passed" : "failed" },
        { ...prev[2], status: "running" },
      ]);
    }, 1600);

    setTimeout(() => {
      setValidationResults((prev) => [
        prev[0],
        prev[1],
        { ...prev[2], status: outcomes[2] ? "passed" : "failed" },
      ]);
    }, 2400);
  };

  const handlePublish = async () => {
    if (!selectedEntity) return;
    const validationLog: PublishValidationEntry[] = validationResults.map((r) => ({
      name: r.name,
      passed: r.status === "passed",
      detail: r.detail,
    }));

    try {
      await createPublishLog.mutateAsync({
        publishKind: selectedEntity.kind,
        entityType: selectedEntity.kind,
        entityId: selectedEntity.id,
        status: "success",
        fileName: selectedEntity.name,
        // No file is uploaded through this dialog, so the size is genuinely
        // unknown rather than a made-up figure.
        fileSize: "unknown",
        notes: versionNoteInput.trim(),
        validationLog,
      });
      setPublishDialogOpen(false);
      toast({
        title: "Publish Successful",
        description: `${selectedEntity.name} was published to the pipeline.`,
      });
      setIsValidating(false);
      setValidationResults([]);
      setVersionNoteInput("");
      setEntityKey("");
    } catch (err) {
      toast({
        title: "Publish failed",
        description: err instanceof Error ? err.message : "Could not record the publish.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Publishing Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage asset publishing pipeline
          </p>
        </div>

        <Dialog
          open={publishDialogOpen}
          onOpenChange={(open) => {
            setPublishDialogOpen(open);
            // Closing via the X button, Escape, or an overlay click (as
            // opposed to the programmatic close in handlePublish) leaves
            // isValidating/validationResults set. Without resetting here,
            // reopening the dialog drops the user back into a finished or
            // failed validation run with no way back to the form — a
            // dead end, especially when a check failed and Confirm Publish
            // is permanently disabled.
            if (!open) {
              setIsValidating(false);
              setValidationResults([]);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!canPublish}
              title={canPublish ? undefined : "You don't have permission to publish"}
            >
              <Upload className="w-4 h-4" /> Publish New
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            {!isValidating ? (
              <form onSubmit={startValidation}>
                <DialogHeader>
                  <DialogTitle>Publish Asset</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Shot / Asset</Label>
                    <Select value={entityKey} onValueChange={setEntityKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a shot or asset" />
                      </SelectTrigger>
                      <SelectContent>
                        {entityOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.name} ({option.kind})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {entityOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No shots or assets exist yet — create one before publishing.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Version Note</Label>
                    <Input
                      required
                      placeholder="What changed?"
                      value={versionNoteInput}
                      onChange={(e) => setVersionNoteInput(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="w-full" disabled={!selectedEntity}>
                    Run Pre-Publish Validators
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-6 py-4">
                <DialogHeader>
                  <DialogTitle>Pipeline Validation</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {validationResults.map((result, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border/50"
                    >
                      <div className="mt-0.5">
                        {result.status === "pending" && (
                          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        {result.status === "running" && (
                          <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                        )}
                        {result.status === "passed" && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                        {result.status === "failed" && (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{result.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {result.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={
                      createPublishLog.isPending ||
                      !validationResults.every((r) => r.status === "passed")
                    }
                    onClick={handlePublish}
                  >
                    {createPublishLog.isPending ? "Publishing…" : "Confirm Publish"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: "In Queue", value: queue.length, ...STATUS_CONFIG.queued },
          {
            title: "Validating",
            value: publishLogs.filter((p) => p.status === "validating").length,
            ...STATUS_CONFIG.validating,
          },
          {
            title: "Published (24h)",
            value: publishedLast24h,
            ...STATUS_CONFIG.success,
          },
          {
            title: "Success Rate",
            value: `${successRate}%`,
            icon: CheckCircle2,
            color: successRate > 90 ? "text-green-500" : "text-yellow-500",
            bg: successRate > 90 ? "bg-green-500/10" : "bg-yellow-500/10",
            label: "Overall",
          },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div
                className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}
              >
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent ({recent.length})</TabsTrigger>
          <TabsTrigger value="all">
            All Publishes ({publishLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-3">
          {queue.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock />
                </EmptyMedia>
                <EmptyTitle>No items in queue</EmptyTitle>
                <EmptyDescription>
                  Publishes will appear here while they're queued or validating.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {queue.map((pub) => {
            const config = STATUS_CONFIG[pub.status];
            return (
              <Card
                key={pub.id}
                className="hover:bg-muted/20 transition-colors"
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}
                  >
                    <config.icon
                      className={`w-5 h-5 ${config.color} ${pub.status === "validating" ? "animate-spin" : ""}`}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {pub.entityName || pub.fileName || pub.entityId}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {pub.publishKind}
                      </Badge>
                      <Badge
                        className={`${config.bg} ${config.color} text-[10px]`}
                      >
                        {config.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      By {pub.publishedBy?.name ?? "Unknown"} ·{" "}
                      {new Date(pub.publishedAt).toLocaleString()}
                    </div>
                  </div>
                  {pub.status === "validating" && (
                    <Progress value={60} className="w-24 h-1.5" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="recent" className="mt-4 space-y-3">
          {recent.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2 />
                </EmptyMedia>
                <EmptyTitle>No recent publishes</EmptyTitle>
                <EmptyDescription>
                  Completed and failed publishes will show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {recent.map((pub) => {
            const config = STATUS_CONFIG[pub.status];
            const isExpanded = expandedLog === pub.id;

            return (
              <Card
                key={pub.id}
                className="hover:bg-muted/20 transition-colors"
              >
                <CardContent className="p-4">
                  <div
                    className="flex items-center gap-4 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedLog(isExpanded ? null : pub.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedLog(isExpanded ? null : pub.id);
                      }
                    }}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}
                    >
                      <config.icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {pub.entityName || pub.fileName || pub.entityId}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {pub.publishKind}
                        </Badge>
                        <Badge
                          className={`${config.bg} ${config.color} text-[10px]`}
                        >
                          {config.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        By {pub.publishedBy?.name ?? "Unknown"} · Size:{" "}
                        {pub.fileSize} · {new Date(pub.publishedAt).toLocaleString()}
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </div>

                  {isExpanded && (
                    <div className="mt-4 ml-14 space-y-4 animate-in slide-in-from-top-2">
                      {/* Validation Checks */}
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                          VALIDATION CHECKS
                        </div>
                        {pub.validationLog.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No validator output was recorded for this publish.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {pub.validationLog.map((check, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                {check.passed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                                )}
                                <div>
                                  <div className={check.passed ? "" : "text-red-500"}>
                                    {check.name}
                                  </div>
                                  {check.detail && (
                                    <div className="text-xs text-muted-foreground">
                                      {check.detail}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                          NOTES
                        </div>
                        <div className="bg-muted/50 rounded-md p-3 font-mono text-xs text-muted-foreground">
                          {pub.notes || "No note was recorded for this publish."}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {publishLogs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>No publishes yet</EmptyTitle>
                <EmptyDescription>
                  Every publish action will show up in this log.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="h-10 px-4 text-left font-medium">Asset</th>
                    <th className="h-10 px-4 text-left font-medium">Kind</th>
                    <th className="h-10 px-4 text-left font-medium">Status</th>
                    <th className="h-10 px-4 text-left font-medium">
                      Publisher
                    </th>
                    <th className="h-10 px-4 text-left font-medium">Size</th>
                    <th className="h-10 px-4 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {publishLogs.map((pub) => {
                    const config = STATUS_CONFIG[pub.status];
                    return (
                      <tr
                        key={pub.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="p-4 font-medium">
                          {pub.entityName || pub.fileName || pub.entityId}
                        </td>
                        <td className="p-4 font-mono text-muted-foreground">
                          {pub.publishKind}
                        </td>
                        <td className="p-4">
                          <Badge
                            className={`${config.bg} ${config.color} text-[10px]`}
                          >
                            {config.label}
                          </Badge>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {pub.publishedBy?.name ?? "Unknown"}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {pub.fileSize}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {new Date(pub.publishedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
