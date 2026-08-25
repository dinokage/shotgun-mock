import { ASSETS, SHOTS, USERS } from "@/data/mockData";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useState } from "react";
import { GitCommit, ArrowRight, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useReviewStore } from "@/store/reviews";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/hooks/use-toast";

/** Human-readable file size for a real, user-selected File object. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VersionsTab({ project }: { project: any }) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const versions = useReviewStore((s) => s.versions);
  const addVersion = useReviewStore((s) => s.addVersion);
  const currentUser = useAuthStore((s) => s.currentUser);
  const { toast } = useToast();

  const projectAssets = ASSETS.filter((a) => a.projectId === project.id);
  const projectShots = SHOTS.filter((s) => s.projectId === project.id);
  const projectEntityIds = new Set([
    ...projectAssets.map((a) => a.id),
    ...projectShots.map((s) => s.id),
  ]);
  const projectVersions = versions.filter((v) =>
    projectEntityIds.has(v.entityId),
  );

  const versionsById = new Map(versions.map((v) => [v.id, v]));
  const selected = selectedVersion ? versionsById.get(selectedVersion) : null;
  /** Walk the real derivedFromId chain back from the selected version, oldest first. Capped to avoid a runaway/circular chain. */
  const lineage: typeof versions = [];
  if (selected) {
    let node: typeof selected | undefined = selected;
    const seen = new Set<string>();
    while (node && !seen.has(node.id) && lineage.length < 6) {
      lineage.unshift(node);
      seen.add(node.id);
      node = node.derivedFromId
        ? versionsById.get(node.derivedFromId)
        : undefined;
    }
  }

  const resetUploadForm = () => {
    setUploadTarget("");
    setUploadNotes("");
    setUploadFile(null);
  };

  const handleUploadSubmit = () => {
    if (!uploadTarget || !uploadFile) return;
    const entityType: "asset" | "shot" = projectAssets.some(
      (a) => a.id === uploadTarget,
    )
      ? "asset"
      : "shot";
    const existingForEntity = versions.filter(
      (v) => v.entityId === uploadTarget,
    );
    const nextNumber = existingForEntity.length + 1;
    const latest = existingForEntity[0];
    addVersion({
      entityId: uploadTarget,
      entityType,
      versionNumber: `v${String(nextNumber).padStart(3, "0")}`,
      status: "pending",
      createdById: currentUser?.id ?? "u1",
      thumbnailSeed: Math.floor(Math.random() * 5000),
      notes: uploadNotes || `Uploaded ${uploadFile.name}`,
      derivedFromId: latest?.id ?? "",
      fileSize: formatFileSize(uploadFile.size),
    });
    toast({
      title: "Version Uploaded",
      description: `${uploadFile.name} added as the newest version.`,
    });
    setUploadOpen(false);
    resetUploadForm();
  };

  return (
    <div className="flex h-full gap-6">
      <div className="w-2/3 flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="font-semibold">Versions & Publishes</div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-2"
            onClick={() => setUploadOpen(true)}
          >
            <UploadCloud className="w-4 h-4" />
            Upload New Version (Any Format)
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {projectVersions.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GitCommit className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No versions yet</EmptyTitle>
                <EmptyDescription>
                  Uploaded versions and publishes for this project will show up
                  here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-2 gap-4 content-start">
              {projectVersions.map((v) => {
                const user = USERS.find((u) => u.id === v.createdById);
                const isSelected = selectedVersion === v.id;
                return (
                  <Card
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "cursor-pointer hover:border-primary/50 transition-all",
                      isSelected ? "border-primary ring-1 ring-primary" : "",
                    )}
                    onClick={() => setSelectedVersion(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedVersion(v.id);
                      }
                    }}
                  >
                    <div className="h-32 bg-muted relative rounded-t-lg overflow-hidden">
                      <div className="absolute top-2 right-2">
                        <StatusBadge
                          status={v.status}
                          className="bg-background/90"
                        />
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs font-mono px-1.5 py-0.5 rounded">
                        {v.versionNumber}
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <div className="font-semibold text-sm mb-1">
                        {v.entityId}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <UserAvatar userId={v.createdById} />
                          <span className="text-xs text-muted-foreground">
                            {user?.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {v.notes && (
                        <div className="text-xs text-muted-foreground mt-2 line-clamp-1">
                          {v.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="w-1/3 flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          Publish Lineage
        </div>
        <div className="flex-1 p-6 relative overflow-x-auto overflow-y-hidden flex items-center justify-center bg-muted/10">
          {selected ? (
            <div className="flex items-center">
              {lineage.map((v, i) => {
                const isCurrent = v.id === selected.id;
                return (
                  <div key={v.id} className="flex items-center">
                    {i > 0 && (
                      <div className="w-16 flex items-center justify-center shrink-0">
                        <div className="h-px bg-border w-full relative">
                          <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-border" />
                        </div>
                      </div>
                    )}
                    <div className="w-32 text-center shrink-0">
                      <div
                        className={cn(
                          "w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center border-2",
                          isCurrent
                            ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                            : "bg-muted border-border text-muted-foreground",
                        )}
                      >
                        <GitCommit />
                      </div>
                      <div
                        className={cn(
                          "font-mono text-xs",
                          isCurrent
                            ? "font-bold text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {v.versionNumber}
                      </div>
                      <div className="text-xs mt-1 capitalize">
                        {isCurrent ? "Current" : v.status.replace(/-/g, " ")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center">
              Select a version to view lineage graph
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) resetUploadForm();
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Upload New Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="upload-target">Asset / Shot</Label>
              <Select value={uploadTarget} onValueChange={setUploadTarget}>
                <SelectTrigger id="upload-target">
                  <SelectValue placeholder="Select an asset or shot…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {projectAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    {projectShots.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upload-file">File (any format)</Label>
              <Input
                id="upload-file"
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upload-notes">Notes</Label>
              <Textarea
                id="upload-notes"
                placeholder="What changed in this version?"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setUploadOpen(false);
                resetUploadForm();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!uploadTarget || !uploadFile}
              onClick={handleUploadSubmit}
            >
              Upload Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
