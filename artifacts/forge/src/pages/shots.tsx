import { useState, useMemo, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { stagger } from "@/lib/motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { useProjectStore } from "@/store/projects";
import { useUserStore } from "@/store/users";
import { Search, Film, Grid3X3, List, X, ChevronDown } from "lucide-react";
import { Link, useSearchParams } from "wouter";
import { useAuthStore } from "@/store/auth";
import { useShots, ShotDTO } from "@/hooks/useShots";
import { StatusBadge } from "@/components/shared/StatusBadge";

// Full Shot.status vocabulary — matches the values the shots API stores and
// the STATUS_STYLES map in StatusBadge.tsx (hyphenated, not underscored).
const SHOT_STATUS_OPTIONS = [
  "not-started",
  "in-progress",
  "bottleneck",
  "review",
  "client-review",
  "at-risk",
  "approved",
  "complete",
  "published",
];

const SEQUENCE_PAGE_SIZE = 8;
const SHOTS_PER_GROUP_PAGE_SIZE = 12;
const LIST_PAGE_SIZE = 50;

export default function Shots() {
  const prefersReducedMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { currentUser } = useAuthStore();
  const projects = useProjectStore((s) => s.projects);
  const users = useUserStore((s) => s.users);
  const { data: shots = [], isLoading } = useShots();
  const [searchParams] = useSearchParams();
  const mineOnly = searchParams.get("mine") === "1";

  const filtered = useMemo(() => {
    return shots.filter((s) => {
      if (mineOnly && s.assigneeId !== currentUser?.id) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (projectFilter !== "all" && s.projectId !== projectFilter)
        return false;
      return true;
    });
  }, [shots, search, statusFilter, projectFilter, mineOnly, currentUser?.id]);

  const grouped = useMemo(() => {
    const groups: Record<string, ShotDTO[]> = {};
    filtered.forEach((s) => {
      const key = s.sequenceId || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [filtered]);

  const sequenceKeys = Object.keys(grouped);

  const [visibleSequences, setVisibleSequences] = useState(SEQUENCE_PAGE_SIZE);
  const [groupVisible, setGroupVisible] = useState<Record<string, number>>({});
  const [listVisible, setListVisible] = useState(LIST_PAGE_SIZE);
  useEffect(() => {
    setVisibleSequences(SEQUENCE_PAGE_SIZE);
    setGroupVisible({});
    setListVisible(LIST_PAGE_SIZE);
  }, [search, statusFilter, projectFilter, mineOnly, currentUser?.id]);

  if (isLoading) return <div className="p-6">Loading shots...</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {mineOnly ? "My Shots" : "Shot Management"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} shots across {Object.keys(grouped).length}{" "}
            sequences
            {mineOnly && " · assigned to you"}
          </p>
        </div>
        {mineOnly && (
          <Link href="/shots">
            <Button variant="outline" size="sm" className="gap-2">
              <X className="w-3.5 h-3.5" /> Clear "My Shots" filter
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 py-3 border-b border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search shots..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {SHOT_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/-/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => setView("grid")}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => setView("list")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {view === "grid" && (
        <div className="space-y-6">
          {Object.entries(grouped)
            .slice(0, visibleSequences)
            .map(([seq, shots]) => {
              const shownInGroup = Math.min(
                groupVisible[seq] ?? SHOTS_PER_GROUP_PAGE_SIZE,
                shots.length,
              );
              return (
                <div key={seq}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {seq} · {shots.length} shots
                    {shownInGroup < shots.length && (
                      <span className="normal-case font-normal tracking-normal text-muted-foreground/70">
                        {" "}
                        (showing {shownInGroup})
                      </span>
                    )}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
                    {shots.slice(0, shownInGroup).map((shot, i) => {
                      const assignee = users.find(
                        (u) => u.id === shot.assigneeId,
                      );
                      return (
                        <motion.div
                          key={shot.id}
                          {...(prefersReducedMotion ? {} : stagger(i))}
                        >
                          <Link href={`/shots/${shot.id}`}>
                            <Card className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-border hover:border-primary/40">
                              <div className="aspect-video relative overflow-hidden bg-muted flex items-center justify-center">
                                {shot.thumbnail ? (
                                  <img
                                    src={shot.thumbnail}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Film className="w-8 h-8 text-muted-foreground/50" />
                                )}
                                <StatusBadge
                                  status={shot.status}
                                  className="absolute top-1.5 right-1.5 text-[8px] border-0"
                                />
                                <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-black/60 to-transparent flex items-end px-2 pb-1">
                                  <span className="text-[9px] text-white/70 font-mono">
                                    {shot.duration || 0}f
                                  </span>
                                </div>
                              </div>
                              <CardContent className="p-2.5">
                                <div className="font-medium text-xs truncate group-hover:text-primary transition-colors">
                                  {shot.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
                                  <span>{shot.duration || 0}f</span>
                                </div>
                                {assignee && (
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <Avatar className="w-4 h-4">
                                      <AvatarImage src={assignee.avatar} />
                                      <AvatarFallback className="text-[8px]">
                                        {assignee.name.charAt(0)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      {assignee.name}
                                    </span>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                  {shownInGroup < shots.length && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          setGroupVisible((v) => ({
                            ...v,
                            [seq]: shownInGroup + SHOTS_PER_GROUP_PAGE_SIZE,
                          }))
                        }
                      >
                        <ChevronDown className="w-3.5 h-3.5" /> Load More Shots
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

          {sequenceKeys.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(visibleSequences, sequenceKeys.length)} of{" "}
                {sequenceKeys.length} sequences
              </p>
              {visibleSequences < sequenceKeys.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setVisibleSequences((v) => v + SEQUENCE_PAGE_SIZE)
                  }
                >
                  <ChevronDown className="w-3.5 h-3.5" /> Load More Sequences
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {view === "list" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium">Shot</th>
                  <th className="h-10 px-4 text-left font-medium">Sequence</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Assignee</th>
                  <th className="h-10 px-4 text-left font-medium">Frames</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, listVisible).map((shot) => {
                  const assignee = users.find(
                    (u) => u.id === shot.assigneeId,
                  );
                  return (
                    <tr
                      key={shot.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-4">
                        <Link
                          href={`/shots/${shot.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {shot.name}
                        </Link>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {shot.sequenceId || "Other"}
                      </td>
                      <td className="p-4">
                        <StatusBadge status={shot.status} className="text-[10px]" />
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {assignee?.name}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {shot.duration || 0}f
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(listVisible, filtered.length)} of{" "}
                {filtered.length} shots
              </p>
              {listVisible < filtered.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setListVisible((v) => v + LIST_PAGE_SIZE)}
                >
                  <ChevronDown className="w-3.5 h-3.5" /> Load More
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <Empty className="border-2 border-dashed border-border rounded-lg py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Film />
            </EmptyMedia>
            <EmptyTitle>No shots found</EmptyTitle>
            <EmptyDescription>
              No shots match your current search and filters.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setProjectFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
