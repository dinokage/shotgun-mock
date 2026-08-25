import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Truck,
  Plus,
  Copy,
  Ban,
  RotateCcw,
  ExternalLink,
  Package,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard, cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useProjectStore } from "@/store/projects";
import { useShotStore } from "@/store/shots";
import {
  useDeliveryStore,
  isDeliveryActive,
  isDeliveryExpired,
  DELIVERY_ELIGIBLE_STATUSES,
  type DeliveryItem,
} from "@/store/deliveries";
import { useIsMobile } from "@/hooks/use-mobile";

const EXPIRY_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "No expiry", days: null as number | null },
];

function statusBadge(
  delivery: { status: string } & Parameters<typeof isDeliveryActive>[0],
) {
  if (isDeliveryActive(delivery)) {
    return (
      <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
        Active
      </Badge>
    );
  }
  if (isDeliveryExpired(delivery)) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Expired
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-500/30 text-red-500">
      Revoked
    </Badge>
  );
}

export default function Deliveries() {
  const { currentUser } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const projects = useProjectStore((s) => s.projects);
  const shots = useShotStore((s) => s.shots);
  const deliveries = useDeliveryStore((s) => s.deliveries);
  const createDelivery = useDeliveryStore((s) => s.createDelivery);
  const revokeDelivery = useDeliveryStore((s) => s.revokeDelivery);
  const reactivateDelivery = useDeliveryStore((s) => s.reactivateDelivery);

  const [createOpen, setCreateOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(
    new Set(),
  );
  const [expiryDays, setExpiryDays] = useState<number | null>(14);
  const [notes, setNotes] = useState("");

  const selectedProject = projects.find((p) => p.id === projectId);

  // Only finished work is eligible to go into a delivery — this is a
  // final-handoff package, not a review queue (that's Client Review).
  const eligibleShots = useMemo(
    () =>
      shots.filter(
        (s) =>
          s.projectId === projectId &&
          (DELIVERY_ELIGIBLE_STATUSES as readonly string[]).includes(s.status),
      ),
    [shots, projectId],
  );

  const resetForm = () => {
    setProjectId("");
    setTitle("");
    setClientName("");
    setSelectedShotIds(new Set());
    setExpiryDays(14);
    setNotes("");
  };

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    setSelectedShotIds(new Set());
    const project = projects.find((p) => p.id === id);
    if (project) {
      setClientName(project.client);
      if (!title) setTitle(`${project.name} — Delivery`);
    }
  };

  const toggleShot = (id: string) => {
    setSelectedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (
      !currentUser ||
      !selectedProject ||
      selectedShotIds.size === 0 ||
      !title.trim()
    )
      return;

    const items: DeliveryItem[] = eligibleShots
      .filter((s) => selectedShotIds.has(s.id))
      .map((s) => ({
        shotId: s.id,
        name: s.name,
        thumbnailSeed: s.thumbnailSeed,
      }));

    const delivery = createDelivery({
      projectId: selectedProject.id,
      title: title.trim(),
      clientName: clientName.trim() || selectedProject.client,
      items,
      createdById: currentUser.id,
      createdByName: currentUser.name,
      expiresAt: expiryDays
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
      notes: notes.trim(),
    });

    toast({
      title: "Delivery Created",
      description: `"${delivery.title}" is ready to share — access code ${delivery.accessCode}.`,
    });
    setCreateOpen(false);
    resetForm();
  };

  const handleCopyLink = async (id: string, accessCode: string) => {
    const url = `${window.location.origin}/delivery/${id}`;
    const ok = await copyToClipboard(`${url} (access code: ${accessCode})`);
    toast(
      ok
        ? {
            title: "Link Copied",
            description: "Delivery link and access code copied to clipboard.",
          }
        : {
            title: "Copy Failed",
            description: "Could not access the clipboard.",
            variant: "destructive",
          },
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Truck className="w-7 h-7 text-muted-foreground" /> Deliveries
          </h1>
          <p className="text-muted-foreground mt-1">
            Final, approved packages sent to clients — scoped and expiring,
            unlike the ongoing Client Review portal.
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> New Delivery
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New Delivery</DialogTitle>
              <DialogDescription>
                Package final approved shots into a shareable, expiring client
                link.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={handleProjectChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {projectId && (
                <>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Trailer Cut — Final Delivery"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client name</Label>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Shots to include ({selectedShotIds.size} selected)
                    </Label>
                    {eligibleShots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No finished (complete, approved, or published) shots in
                        this project yet.
                      </p>
                    ) : (
                      <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border">
                        {eligibleShots.map((s) => (
                          <label
                            key={s.id}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedShotIds.has(s.id)}
                              onChange={() => toggleShot(s.id)}
                              className="accent-primary"
                            />
                            <span className="flex-1 truncate">{s.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {s.status}
                            </Badge>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Link expiry</Label>
                    <Select
                      value={String(expiryDays)}
                      onValueChange={(v) =>
                        setExpiryDays(v === "null" ? null : Number(v))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPIRY_OPTIONS.map((o) => (
                          <SelectItem key={o.label} value={String(o.days)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional, shown to the client)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Masters only, ProRes 4444."
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  !projectId || selectedShotIds.size === 0 || !title.trim()
                }
              >
                Create Delivery
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {deliveries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle>No deliveries yet</EmptyTitle>
            <EmptyDescription>
              Create one to package approved shots into a shareable client link.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {deliveries.map((d) => {
            const project = projects.find((p) => p.id === d.projectId);
            const active = isDeliveryActive(d);
            const revokeDialog = (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "gap-1.5 text-red-500 hover:bg-red-500/10 hover:text-red-500",
                      isMobile && "col-span-2 touch-target",
                    )}
                  >
                    <Ban className="w-3.5 h-3.5" /> Revoke
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Revoke this delivery link?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The access code will stop working immediately. Anyone who
                      currently has the link, including the client, will see it
                      as revoked.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => revokeDelivery(d.id)}>
                      Revoke
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            );

            return (
              <Card key={d.id}>
                {isMobile ? (
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">
                            {d.title}
                          </span>
                          {statusBadge(d)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {project?.name ?? "Unknown project"} • {d.clientName}{" "}
                          • {d.items.length} shot
                          {d.items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground font-mono pl-[52px]">
                      <span>code: {d.accessCode}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{" "}
                        {d.expiresAt
                          ? `expires ${new Date(d.expiresAt).toLocaleDateString()}`
                          : "no expiry"}
                      </span>
                      <span>
                        {d.downloadCount} access
                        {d.downloadCount === 1 ? "" : "es"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 touch-target"
                        onClick={() => handleCopyLink(d.id, d.accessCode)}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 touch-target"
                        onClick={() => setLocation(`/delivery/${d.id}`)}
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </Button>
                      {active ? (
                        revokeDialog
                      ) : !isDeliveryExpired(d) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="col-span-2 gap-1.5 touch-target"
                          onClick={() => reactivateDelivery(d.id)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reactivate
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                ) : (
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">
                          {d.title}
                        </span>
                        {statusBadge(d)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {project?.name ?? "Unknown project"} • {d.clientName} •{" "}
                        {d.items.length} shot{d.items.length === 1 ? "" : "s"}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1.5 font-mono">
                        <span>code: {d.accessCode}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{" "}
                          {d.expiresAt
                            ? `expires ${new Date(d.expiresAt).toLocaleDateString()}`
                            : "no expiry"}
                        </span>
                        <span>
                          {d.downloadCount} access
                          {d.downloadCount === 1 ? "" : "es"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleCopyLink(d.id, d.accessCode)}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setLocation(`/delivery/${d.id}`)}
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </Button>
                      {active ? (
                        revokeDialog
                      ) : !isDeliveryExpired(d) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => reactivateDelivery(d.id)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reactivate
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
