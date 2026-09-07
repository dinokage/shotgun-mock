import { useState } from "react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { useAssetStore } from "@/store/assets";
import { useShotStore } from "@/store/shots";
import { useUserStore } from "@/store/users";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  History,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuditStore } from "@/store/audit";

export default function AuditLog() {
  // "asset1" is a mock id that exists in no real tenant, so the page used to
  // open looking empty for every real studio. Default to no selection
  // instead.
  const [selectedEntity, setSelectedEntity] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Capping the dropdown to the first 40 assets/shots made everything past
  // that point (the large majority, in a real tenant) unreachable -- there
  // was no way to search past the cap, and it wasn't even the 40 most
  // recent/relevant, just array order. Filter by name first, so the cap
  // applies to matches instead of to the raw list.
  const [entitySearch, setEntitySearch] = useState("");
  const { toast } = useToast();
  const assets = useAssetStore((s) => s.assets);
  const shots = useShotStore((s) => s.shots);
  const users = useUserStore((s) => s.users);
  const searchTerm = entitySearch.trim().toLowerCase();
  const filteredAssets = searchTerm
    ? assets.filter((a) => a.name.toLowerCase().includes(searchTerm))
    : assets;
  const filteredShots = searchTerm
    ? shots.filter((s) => s.name.toLowerCase().includes(searchTerm))
    : shots;

  const rollbackPoints = useAuditStore((s) => s.rollbackPoints);
  const rollbackEntity = useAuditStore((s) => s.rollbackEntity);
  const clearRollback = useAuditStore((s) => s.clearRollback);
  const rollbackPoint = rollbackPoints[selectedEntity];

  // Server-side filtered by entityId and already ordered newest-first.
  const { data: events = [] } = useAuditLogs(selectedEntity);
  // Every log row for a given entityId shares the same targetEntityType, so
  // any row tells us which real store (assets vs shots) rollback should hit
  // — fall back to the id's own prefix for an entity with no rows yet.
  const entityType: "asset" | "shot" =
    (events[0]?.targetEntityType as "asset" | "shot" | undefined) ??
    (selectedEntity.startsWith("asset") ? "asset" : "shot");

  const handleRollback = (timestamp: string) => {
    // Belt-and-suspenders: the UI no longer renders a Rollback button
    // without a real selection (events is empty until one is chosen), but
    // silently no-ops on a missing entity used to look identical to a
    // successful rollback -- fail loudly instead if this is ever reached.
    if (!selectedEntity) {
      toast({
        title: "Nothing to roll back",
        description: "Select an entity first.",
        variant: "destructive",
      });
      return;
    }
    rollbackEntity(selectedEntity, entityType, timestamp, events);
    toast({
      title: "Rollback complete",
      description: `${selectedEntity} restored to state at ${timestamp} — real fields updated, not just this timeline view.`,
    });
  };

  const handleRestoreLatest = () => {
    clearRollback(selectedEntity, entityType);
    toast({
      title: "Restored to latest",
      description: `${selectedEntity} is back to its current state.`,
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time Travel</h1>
          <p className="text-muted-foreground mt-1">
            Audit log and state rollback
          </p>
        </div>
        <div className="w-80 space-y-1.5">
          <Input
            placeholder="Filter by name..."
            value={entitySearch}
            onChange={(e) => setEntitySearch(e.target.value)}
            className="h-8 text-xs"
          />
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger>
              <SelectValue placeholder="Select entity..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Assets</SelectLabel>
                {filteredAssets.slice(0, 40).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.id})
                  </SelectItem>
                ))}
                {filteredAssets.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No matches.
                  </div>
                )}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Shots</SelectLabel>
                {filteredShots.slice(0, 40).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.id})
                  </SelectItem>
                ))}
                {filteredShots.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No matches.
                  </div>
                )}
                {filteredShots.length > 40 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {filteredShots.length - 40} more match — refine your search.
                  </div>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedEntity && rollbackPoint && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-medium">Rolled back</span>{" "}
              <span className="text-muted-foreground">
                — <span className="font-mono">{selectedEntity}</span> is showing
                state as of <span className="font-mono">{rollbackPoint}</span>.
                Events after this point are marked reverted below.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleRestoreLatest}
            >
              <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Restore latest
            </Button>
          </CardContent>
        </Card>
      )}

      {!selectedEntity && (
        <div className="text-sm text-muted-foreground text-center py-12">
          Select an asset or shot above to view its audit history.
        </div>
      )}

      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[35px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
        {selectedEntity && events.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No recorded changes yet for this entity.
          </div>
        )}
        {events.map((event, index) => {
          const user = users.find((u) => u.id === event.actorUserId);
          const isExpanded = expandedId === event.id;
          const changedFields = Object.keys(event.metadata.before);
          const hasChanges = changedFields.length > 0;
          const isReverted =
            Boolean(rollbackPoint) && event.createdAt > rollbackPoint;
          const description =
            changedFields.length > 0
              ? `Updated ${changedFields.join(", ")}`
              : `${event.action} ${event.targetEntityType}`;

          return (
            <Card
              key={event.id}
              className={`relative overflow-hidden hover:border-primary/30 transition-colors z-10 ${isReverted ? "opacity-50" : ""}`}
            >
              <div className="p-4 flex items-start gap-4 bg-card relative">
                <button
                  type="button"
                  className="flex-1 flex items-start gap-4 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-background border-2 border-primary flex items-center justify-center shrink-0 z-10 shadow-[0_0_10px_rgba(var(--primary),0.2)]">
                    <History className="w-4 h-4 text-primary" />
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {event.action}
                        </span>
                        <span
                          className={
                            isReverted
                              ? "line-through decoration-destructive/60"
                              : ""
                          }
                        >
                          {description}
                        </span>
                        {isReverted && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-destructive/30 text-destructive"
                          >
                            Reverted
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {event.createdAt}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <UserAvatar
                        userId={event.actorUserId}
                        className="w-4 h-4"
                      />
                      <span>{user?.name}</span>
                      {hasChanges && (
                        <span className="ml-4 flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                          {changedFields.length} field(s)
                          changed
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 group hover:border-destructive hover:text-destructive transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5 group-hover:-rotate-90 transition-transform" />{" "}
                      Rollback
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Rollback to this state?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This restores{" "}
                        <span className="font-mono">{selectedEntity}</span> to
                        its state as of{" "}
                        <span className="font-mono">{event.createdAt}</span>.
                        Changes made after this point will be discarded.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRollback(event.createdAt)}
                      >
                        Rollback
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {isExpanded && hasChanges && (
                <CardContent className="bg-muted/10 border-t border-border p-4 font-mono text-xs">
                  <div className="space-y-2">
                    {changedFields.map((field) => {
                      // assigneeId stores real user ids so rollback can
                      // apply them directly to the entity — resolve to a
                      // name here for readability, same idea as UserAvatar
                      // does elsewhere on this page.
                      const formatValue = (value: unknown) => {
                        if (value === null || value === undefined) return "—";
                        if (field === "assigneeId" && typeof value === "string") {
                          return users.find((u) => u.id === value)?.name ?? value;
                        }
                        return String(value);
                      };
                      const before = formatValue(event.metadata.before[field]);
                      const after = formatValue(event.metadata.after[field]);
                      return (
                        <div
                          key={field}
                          className="grid grid-cols-[120px_1fr] gap-4"
                        >
                          <div className="text-muted-foreground">{field}:</div>
                          <div>
                            <span className="text-red-400/80 line-through">
                              {before}
                            </span>
                            <span className="text-muted-foreground mx-2">
                              →
                            </span>
                            <span className="text-status-green">{after}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
