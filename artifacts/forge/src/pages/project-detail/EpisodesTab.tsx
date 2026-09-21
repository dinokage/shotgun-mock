import { useMemo, useState } from "react";
import {
  Film,
  Layers,
  Clapperboard,
  SlidersHorizontal,
  Search,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Plus,
  X,
} from "lucide-react";
import { useShotStore } from "@/store/shots";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useEpisodes, useCreateEpisode } from "@/hooks/useEpisodes";
import { useSequences, useCreateSequence } from "@/hooks/useSequences";
import { useUpdateShot, useCreateShot } from "@/hooks/useShots";
import { useCapability } from "@/hooks/use-capability";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { shotNumber } from "@/lib/shotName";
import type { Shot } from "@/data/mockData";

type Level = "episodes" | "sequences" | "shots";

interface FilterState {
  dept: string[];
  artist: string[];
  search: string;
}
const emptyFilterState = (): FilterState => ({ dept: [], artist: [], search: "" });

/**
 * Toolbar shared by all three drill-down levels: breadcrumb back button,
 * search, and a department/artist filter popover. Filter state is owned by
 * the parent per-level (independent per level, not shared) -- this just
 * renders whatever slice it's handed.
 */
function LevelToolbar({
  title,
  onBack,
  filter,
  setFilter,
  availableDepts,
  availableArtists,
  onAdd,
  addLabel,
}: {
  title: string;
  onBack?: () => void;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  availableDepts: { id: string; name: string }[];
  availableArtists: { id: string; name: string }[];
  onAdd?: () => void;
  addLabel?: string;
}) {
  const activeFilterCount = filter.dept.length + filter.artist.length;
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="p-3 border-b border-border bg-card flex items-center gap-3">
      {onBack && (
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      )}
      <div className="font-medium text-sm truncate flex-1 min-w-0">{title}</div>
      <div className="relative w-56 shrink-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="pl-9 h-9"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9 relative shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                Department
                {filter.dept.length > 0 && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setFilter({ ...filter, dept: [] })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {availableDepts.length === 0 && (
                  <div className="text-xs text-muted-foreground">No departments assigned yet.</div>
                )}
                {availableDepts.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={filter.dept.includes(d.id)}
                      onCheckedChange={() =>
                        setFilter({ ...filter, dept: toggle(filter.dept, d.id) })
                      }
                    />
                    <span>{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                Artist
                {filter.artist.length > 0 && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setFilter({ ...filter, artist: [] })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {availableArtists.length === 0 && (
                  <div className="text-xs text-muted-foreground">No one assigned yet.</div>
                )}
                {availableArtists.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={filter.artist.includes(a.id)}
                      onCheckedChange={() =>
                        setFilter({ ...filter, artist: toggle(filter.artist, a.id) })
                      }
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => setFilter({ ...filter, dept: [], artist: [] })}
              >
                Reset all filters
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {onAdd && (
        <Button size="sm" className="gap-1.5 shrink-0" onClick={onAdd}>
          <Plus className="w-4 h-4" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

export default function EpisodesTab({ project }: { project: any }) {
  const [level, setLevel] = useState<Level>("episodes");
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [activeSequenceId, setActiveSequenceId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const [episodeFilter, setEpisodeFilter] = useState<FilterState>(emptyFilterState());
  const [sequenceFilter, setSequenceFilter] = useState<FilterState>(emptyFilterState());
  const [shotFilter, setShotFilter] = useState<FilterState>(emptyFilterState());

  const { data: episodes = [] } = useEpisodes(project.id);
  // Unfiltered -- episode-level needs every sequence to count them per
  // episode, sequence-level filters this client-side by activeEpisodeId.
  const { data: allSequences = [] } = useSequences(project.id);
  const allShots = useShotStore((s) => s.shots);
  const shots = useMemo(
    () => allShots.filter((s) => s.projectId === project.id),
    [allShots, project.id],
  );
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const updateShot = useUpdateShot();
  const canAssign = useCapability("assign_tasks");
  const canCreate = useCapability("create_tasks");
  const { toast } = useToast();

  const createEpisode = useCreateEpisode();
  const createSequence = useCreateSequence();
  const createShot = useCreateShot();
  const [addDialogLevel, setAddDialogLevel] = useState<Level | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const artists = useMemo(() => users.filter((u) => u.role === "artist"), [users]);

  const activeEpisode = episodes.find((e) => e.id === activeEpisodeId) ?? null;
  const activeSequence = allSequences.find((s) => s.id === activeSequenceId) ?? null;
  // Derived, not the raw `level` state directly -- if the active episode or
  // sequence has vanished from under a deeper level (deleted mid-session, or
  // state left over from a project switch), this falls back to the nearest
  // valid level instead of rendering a dead end or fixing up state mid-render.
  const effectiveLevel: Level =
    level === "shots" && activeEpisode && activeSequence
      ? "shots"
      : level !== "episodes" && activeEpisode
        ? "sequences"
        : "episodes";

  const matchesFilter = (shot: Shot, f: FilterState) => {
    if (f.dept.length) {
      const deptId = shot.assigneeId ? userById.get(shot.assigneeId)?.departmentId : null;
      if (!deptId || !f.dept.includes(deptId)) return false;
    }
    if (f.artist.length && !f.artist.includes(shot.assigneeId)) return false;
    return true;
  };

  const availableFor = (scopedShots: Shot[]) => {
    const artistIds = new Set(scopedShots.map((s) => s.assigneeId).filter(Boolean));
    const deptIds = new Set(
      [...artistIds]
        .map((id) => userById.get(id)?.departmentId)
        .filter((id): id is string => !!id),
    );
    return {
      depts: [...deptIds].map((id) => deptById.get(id)).filter((d): d is NonNullable<typeof d> => !!d),
      artistsList: [...artistIds]
        .map((id) => userById.get(id))
        .filter((u): u is NonNullable<typeof u> => !!u),
    };
  };

  const handleAssign = async (shot: Shot, artistId: string, artistName: string) => {
    try {
      await updateShot.mutateAsync({ id: shot.id, assigneeId: artistId });
      toast({ title: "Assigned", description: `${shot.name} assigned to ${artistName}.` });
    } catch (err: any) {
      toast({
        title: "Couldn't assign shot",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  const handleCreateItem = async () => {
    const name = newItemName.trim();
    if (!name || !addDialogLevel) return;
    try {
      if (addDialogLevel === "episodes") {
        await createEpisode.mutateAsync({ projectId: project.id, name });
      } else if (addDialogLevel === "sequences" && activeEpisode) {
        await createSequence.mutateAsync({
          projectId: project.id,
          episodeId: activeEpisode.id,
          name,
        });
      } else if (addDialogLevel === "shots" && activeSequence) {
        await createShot.mutateAsync({
          projectId: project.id,
          episodeId: activeEpisode?.id,
          sequenceId: activeSequence.id,
          name,
        });
      } else {
        return;
      }
      toast({
        title: `${addDialogLevel === "episodes" ? "Episode" : addDialogLevel === "sequences" ? "Sequence" : "Shot"} added`,
        description: `"${name}" was created.`,
      });
      setNewItemName("");
      setAddDialogLevel(null);
    } catch (err: any) {
      toast({
        title: "Couldn't create it",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    }
  };
  const isCreating =
    createEpisode.isPending || createSequence.isPending || createShot.isPending;

  const addItemDialog = (
    <Dialog
      open={addDialogLevel !== null}
      onOpenChange={(open) => !open && setAddDialogLevel(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {addDialogLevel === "episodes"
              ? "Add Episode"
              : addDialogLevel === "sequences"
                ? "Add Sequence"
                : "Add Shot"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-item-name">Name</Label>
          <Input
            id="new-item-name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder={
              addDialogLevel === "episodes"
                ? "e.g. Ep010"
                : addDialogLevel === "sequences"
                  ? "e.g. sc005"
                  : "e.g. sh001"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && newItemName.trim() && !isCreating) {
                handleCreateItem();
              }
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddDialogLevel(null)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateItem} disabled={!newItemName.trim() || isCreating}>
            {isCreating ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // --- Episode level ---
  if (effectiveLevel === "episodes") {
    const episodeShotsOf = (episodeId: string) => shots.filter((s) => s.episodeId === episodeId);
    const episodeSeqCount = (episodeId: string) =>
      allSequences.filter((sq) => sq.episodeId === episodeId).length;

    const filteredEpisodes = episodes.filter((ep) => {
      if (episodeFilter.search && !ep.name.toLowerCase().includes(episodeFilter.search.toLowerCase()))
        return false;
      if (episodeFilter.dept.length || episodeFilter.artist.length) {
        return episodeShotsOf(ep.id).some((s) => matchesFilter(s, episodeFilter));
      }
      return true;
    });

    const { depts, artistsList } = availableFor(shots);

    return (
      <>
      <div className="flex h-full overflow-hidden border border-border rounded-lg bg-card/50">
        <div className="flex-1 flex flex-col min-w-0">
          <LevelToolbar
            title="Episodes"
            filter={episodeFilter}
            setFilter={setEpisodeFilter}
            availableDepts={depts}
            availableArtists={artistsList}
            onAdd={
              canCreate
                ? () => {
                    setNewItemName("");
                    setAddDialogLevel("episodes");
                  }
                : undefined
            }
            addLabel="Add Episode"
          />
          <ScrollArea className="flex-1 p-4">
            {filteredEpisodes.length === 0 ? (
              <EmptyState
                icon={<Film className="w-6 h-6" />}
                title="No episodes found"
                description={
                  episodes.length
                    ? "No episodes match the current search or filters."
                    : "This project has no episodes yet."
                }
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
                {filteredEpisodes.map((ep) => (
                  <HierarchyCard
                    key={ep.id}
                    icon={<Film className="w-8 h-8 text-primary/60" />}
                    name={ep.name}
                    id={ep.id}
                    stat={`${episodeSeqCount(ep.id)} sequence${episodeSeqCount(ep.id) === 1 ? "" : "s"} · ${episodeShotsOf(ep.id).length} shot${episodeShotsOf(ep.id).length === 1 ? "" : "s"}`}
                    onClick={() => {
                      setActiveEpisodeId(ep.id);
                      setLevel("sequences");
                    }}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
      {addItemDialog}
      </>
    );
  }

  // --- Sequence level ---
  if (effectiveLevel === "sequences" && activeEpisode) {
    const sequencesInEpisode = allSequences.filter((sq) => sq.episodeId === activeEpisode.id);
    const sequenceShotsOf = (sequenceId: string) => shots.filter((s) => s.sequenceId === sequenceId);

    const filteredSequences = sequencesInEpisode.filter((sq) => {
      if (
        sequenceFilter.search &&
        !sq.name.toLowerCase().includes(sequenceFilter.search.toLowerCase())
      )
        return false;
      if (sequenceFilter.dept.length || sequenceFilter.artist.length) {
        return sequenceShotsOf(sq.id).some((s) => matchesFilter(s, sequenceFilter));
      }
      return true;
    });

    const { depts, artistsList } = availableFor(shots.filter((s) => s.episodeId === activeEpisode.id));

    return (
      <>
      <div className="flex h-full overflow-hidden border border-border rounded-lg bg-card/50">
        <div className="flex-1 flex flex-col min-w-0">
          <LevelToolbar
            title={`Episodes / ${activeEpisode.name}`}
            onBack={() => {
              setLevel("episodes");
              setActiveEpisodeId(null);
            }}
            filter={sequenceFilter}
            setFilter={setSequenceFilter}
            availableDepts={depts}
            availableArtists={artistsList}
            onAdd={
              canCreate
                ? () => {
                    setNewItemName("");
                    setAddDialogLevel("sequences");
                  }
                : undefined
            }
            addLabel="Add Sequence"
          />
          <ScrollArea className="flex-1 p-4">
            {filteredSequences.length === 0 ? (
              <EmptyState
                icon={<Layers className="w-6 h-6" />}
                title="No sequences found"
                description={
                  sequencesInEpisode.length
                    ? "No sequences match the current search or filters."
                    : "This episode has no sequences yet."
                }
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
                {filteredSequences.map((sq) => (
                  <HierarchyCard
                    key={sq.id}
                    icon={<Layers className="w-8 h-8 text-primary/60" />}
                    name={sq.name}
                    id={sq.id}
                    stat={`${sequenceShotsOf(sq.id).length} shot${sequenceShotsOf(sq.id).length === 1 ? "" : "s"}`}
                    onClick={() => {
                      setActiveSequenceId(sq.id);
                      setLevel("shots");
                    }}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
      {addItemDialog}
      </>
    );
  }

  // --- Shot level ---
  if (effectiveLevel === "shots" && activeEpisode && activeSequence) {
    const shotsInSequence = shots.filter((s) => s.sequenceId === activeSequence.id);
    const query = shotFilter.search.trim().toLowerCase();
    const filteredShots = shotsInSequence.filter((s) => {
      if (
        query &&
        !s.name.toLowerCase().includes(query) &&
        !s.id.toLowerCase().includes(query)
      )
        return false;
      return matchesFilter(s, shotFilter);
    });
    const { depts, artistsList } = availableFor(shotsInSequence);
    const selectedShot = filteredShots.find((s) => s.id === selectedShotId) ?? null;

    return (
      <div className="flex h-full overflow-hidden border border-border rounded-lg bg-card/50">
        <div className="flex-1 flex flex-col min-w-0">
          <LevelToolbar
            title={`Episodes / ${activeEpisode.name} / ${activeSequence.name}`}
            onBack={() => {
              setLevel("sequences");
              setActiveSequenceId(null);
              setSelectedShotId(null);
            }}
            filter={shotFilter}
            setFilter={setShotFilter}
            availableDepts={depts}
            availableArtists={artistsList}
          />
          <ScrollArea className="flex-1 p-4">
            {filteredShots.length === 0 ? (
              <EmptyState
                icon={<Clapperboard className="w-6 h-6" />}
                title="No shots found"
                description={
                  shotsInSequence.length
                    ? "No shots match the current search or filters."
                    : "This sequence has no shots yet."
                }
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
                {filteredShots.map((shot) => {
                  const card = (
                    <div
                      key={shot.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedShotId(shot.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedShotId(shot.id);
                        }
                      }}
                      className={cn(
                        "border rounded-md overflow-hidden bg-card cursor-pointer hover:border-primary/50 transition-colors group",
                        selectedShotId === shot.id
                          ? "ring-2 ring-primary border-primary"
                          : "border-border",
                      )}
                    >
                      <div className="h-24 w-full bg-gradient-to-br from-primary/20 to-sidebar relative">
                        <div className="absolute top-2 right-2">
                          <StatusBadge status={shot.status} className="bg-background/90" />
                        </div>
                      </div>
                      <div className="p-3">
                        <div
                          className="font-medium text-sm truncate"
                          title={shot.name}
                        >
                          {shotNumber(shot.name)}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <UserAvatar userId={shot.assigneeId} />
                          <span className="text-[10px] text-muted-foreground">
                            Upd: {shot.updatedAt?.substring(5)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );

                  if (!canAssign) return card;

                  return (
                    <ContextMenu key={shot.id}>
                      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
                      <ContextMenuContent className="w-56">
                        <ContextMenuLabel className="flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5" /> Assign to...
                        </ContextMenuLabel>
                        <ContextMenuSeparator />
                        {departments.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            No departments set up yet.
                          </div>
                        )}
                        {departments.map((dept) => {
                          const deptArtists = artists.filter((a) => a.departmentId === dept.id);
                          return (
                            <ContextMenuSub key={dept.id}>
                              <ContextMenuSubTrigger>{dept.name}</ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                {deptArtists.length === 0 ? (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    No artists in this department.
                                  </div>
                                ) : (
                                  deptArtists.map((a) => (
                                    <ContextMenuItem
                                      key={a.id}
                                      onClick={() => handleAssign(shot, a.id, a.name)}
                                    >
                                      {a.name}
                                    </ContextMenuItem>
                                  ))
                                )}
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          );
                        })}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {selectedShot && (
          <div className="w-80 border-l border-border bg-card flex flex-col animate-in slide-in-from-right-8 duration-200 shrink-0">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold truncate pr-2">{selectedShot.id}</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setSelectedShotId(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Name</div>
                  <div className="font-medium text-sm">{selectedShot.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <StatusBadge status={selectedShot.status} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Assignee</div>
                  <div className="flex items-center gap-2 text-sm">
                    <UserAvatar userId={selectedShot.assigneeId} />
                    {users.find((u) => u.id === selectedShot.assigneeId)?.name ?? "Unassigned"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Frame Range</div>
                  <div className="text-sm">{selectedShot.frameRange}</div>
                </div>
                {selectedShot.notes && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Notes</div>
                    <div className="text-sm whitespace-pre-wrap">{selectedShot.notes}</div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  }

  // Unreachable: effectiveLevel always resolves to one of the three branches
  // above (it defaults to "episodes", which is always renderable).
  return null;
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function HierarchyCard({
  icon,
  name,
  id,
  stat,
  onClick,
}: {
  icon: React.ReactNode;
  name: string;
  id: string;
  stat: string;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="border border-border rounded-md overflow-hidden bg-card cursor-pointer hover:border-primary/50 transition-colors group"
    >
      <div className="h-24 w-full bg-gradient-to-br from-primary/20 to-sidebar flex items-center justify-center">
        {icon}
      </div>
      <div className="p-3">
        <div className="font-mono text-[10px] text-muted-foreground mb-1">{id}</div>
        <div className="font-medium text-sm truncate flex items-center justify-between" title={name}>
          <span className="truncate">{name}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </div>
        <div className="mt-3 text-[10px] text-muted-foreground">{stat}</div>
      </div>
    </div>
  );
}
