import { useState } from "react";
import { motion } from "framer-motion";
import { USERS } from "@/data/mockData";
import { useShotStore } from "@/store/shots";
import { useAssetStore } from "@/store/assets";
import { useReviewStore } from "@/store/reviews";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Search, SlidersHorizontal, X, FileVideo, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fadeInUp } from "@/lib/motion";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

export default function AssetsTab({ project }: { project: any }) {
  const [view, setView] = useState("shots");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const shots = useShotStore((state) => state.shots);
  const assets = useAssetStore((state) => state.assets);
  const updateShot = useShotStore((state) => state.updateShot);
  const updateAsset = useAssetStore((state) => state.updateAsset);
  const versions = useReviewStore((state) => state.versions);

  const allItems =
    view === "shots"
      ? shots.filter((s) => s.projectId === project.id)
      : assets.filter((a) => a.projectId === project.id);
  const availableStatuses = Array.from(
    new Set(allItems.map((i) => i.status)),
  ).sort();
  const availableTypes =
    view === "assets"
      ? Array.from(new Set((allItems as any[]).map((i) => i.type))).sort()
      : [];

  const query = search.trim().toLowerCase();
  const items = allItems.filter(
    (i) =>
      (statusFilter.length === 0 || statusFilter.includes(i.status)) &&
      (view !== "assets" ||
        typeFilter.length === 0 ||
        typeFilter.includes((i as any).type)) &&
      (query === "" ||
        i.name.toLowerCase().includes(query) ||
        i.id.toLowerCase().includes(query)),
  );
  const activeFilterCount = statusFilter.length + typeFilter.length;
  const selectedItem = items.find((i) => i.id === selectedId);
  const hasAnyItems = allItems.length > 0;
  const recentVersions = selectedItem
    ? versions
        .filter((v) => v.entityId === selectedItem.id)
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 3)
    : [];

  const toggleFilter = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
  ) => {
    setList(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  };

  return (
    <div className="flex h-full overflow-hidden border border-border rounded-lg bg-card/50">
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => {
                if (v) setView(v);
                setSelectedId(null);
                setStatusFilter([]);
                setTypeFilter([]);
              }}
            >
              <ToggleGroupItem value="shots" className="gap-2 px-3">
                <FileVideo className="w-4 h-4" /> Shots
              </ToggleGroupItem>
              <ToggleGroupItem value="assets" className="gap-2 px-3">
                <Box className="w-4 h-4" /> Assets
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Search ${view}...`}
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 relative"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {activeFilterCount > 0 && (
                    <motion.span
                      key={activeFilterCount}
                      {...fadeInUp}
                      className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center"
                    >
                      {activeFilterCount}
                    </motion.span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-3">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                      Status
                      {statusFilter.length > 0 && (
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => setStatusFilter([])}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {availableStatuses.map((status) => (
                        <label
                          key={status}
                          className="flex items-center gap-2 text-xs cursor-pointer"
                        >
                          <Checkbox
                            checked={statusFilter.includes(status)}
                            onCheckedChange={() =>
                              toggleFilter(
                                statusFilter,
                                setStatusFilter,
                                status,
                              )
                            }
                          />
                          <span className="capitalize">
                            {status.replace(/-/g, " ")}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {view === "assets" && availableTypes.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                        Type
                        {typeFilter.length > 0 && (
                          <button
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => setTypeFilter([])}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {availableTypes.map((type) => (
                          <label
                            key={type}
                            className="flex items-center gap-2 text-xs cursor-pointer"
                          >
                            <Checkbox
                              checked={typeFilter.includes(type)}
                              onCheckedChange={() =>
                                toggleFilter(typeFilter, setTypeFilter, type)
                              }
                            />
                            <span>{type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => {
                        setStatusFilter([]);
                        setTypeFilter([]);
                      }}
                    >
                      Reset all filters
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {items.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SlidersHorizontal className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No {view} found</EmptyTitle>
                <EmptyDescription>
                  {hasAnyItems
                    ? `No ${view} match the current search or filters.`
                    : `This project has no ${view} yet.`}
                </EmptyDescription>
              </EmptyHeader>
              {(activeFilterCount > 0 || query !== "") && (
                <EmptyContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatusFilter([]);
                      setTypeFilter([]);
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
              {items.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(item.id);
                    }
                  }}
                  className={cn(
                    "border rounded-md overflow-hidden bg-card cursor-pointer hover:border-primary/50 transition-colors group",
                    selectedId === item.id
                      ? "ring-2 ring-primary border-primary"
                      : "border-border",
                  )}
                >
                  <div className="h-24 w-full bg-gradient-to-br from-primary/20 to-sidebar relative">
                    <div className="absolute top-2 right-2">
                      <StatusBadge
                        status={item.status}
                        className="bg-background/90"
                      />
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="font-mono text-[10px] text-muted-foreground mb-1">
                      {item.id}
                    </div>
                    <div
                      className="font-medium text-sm truncate"
                      title={item.name}
                    >
                      {item.name}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <UserAvatar userId={item.assigneeId} />
                      <span className="text-[10px] text-muted-foreground">
                        Upd: {item.updatedAt.substring(5)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {selectedItem && (
        <div className="w-80 border-l border-border bg-card flex flex-col animate-in slide-in-from-right-8 duration-200 shrink-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold truncate pr-2">{selectedItem.id}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setSelectedId(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Name</div>
                  <div className="font-medium text-sm">{selectedItem.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Status
                  </div>
                  <StatusBadge status={selectedItem.status} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Assignee
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <UserAvatar userId={selectedItem.assigneeId} />
                    {USERS.find((u) => u.id === selectedItem.assigneeId)?.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Last Updated
                  </div>
                  <div className="text-sm">{selectedItem.updatedAt}</div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium mb-3">Recent Versions</div>
                {recentVersions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No versions submitted yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentVersions.map((v) => {
                      const author = USERS.find((u) => u.id === v.createdById);
                      return (
                        <div
                          key={v.id}
                          className="text-xs p-2 border border-border rounded bg-muted/30"
                        >
                          <span className="font-mono">{v.versionNumber}</span>
                          {" - "}
                          <span className="capitalize">
                            {v.status.replace(/-/g, " ")}
                          </span>
                          {author && (
                            <span className="text-muted-foreground">
                              {" "}
                              by {author.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium mb-3">Notes</div>
                <textarea
                  className="w-full h-24 bg-muted/50 border border-border rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Add notes..."
                  value={selectedItem.notes ?? ""}
                  onChange={(e) => {
                    const notes = e.target.value;
                    if (view === "shots")
                      updateShot(selectedItem.id, { notes });
                    else updateAsset(selectedItem.id, { notes });
                  }}
                />
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
