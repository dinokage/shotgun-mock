import { useState, useMemo, type MouseEvent } from "react";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { USERS, PROJECTS, DEPARTMENTS } from "@/data/mockData";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";
import {
  Search,
  ListTodo,
  LayoutGrid,
  List,
  AlertTriangle,
  Circle,
  Play,
  UserCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useUIStore } from "@/store/ui";
import KanbanView from "./project-detail/TasksKanban";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { DEPARTMENT_LEADERSHIP_ROLES } from "@/store/permissions";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "kanban";

export default function Tasks() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [view, setView] = useState<ViewMode>(() => {
    const role = useAuthStore.getState().currentUser?.role;
    return role === "artist" ? "kanban" : "list";
  });

  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(() => {
    const role = useAuthStore.getState().currentUser?.role;
    return !!role && DEPARTMENT_LEADERSHIP_ROLES.includes(role);
  });

  const isMobile = useIsMobile();
  const { data: liveTasks = [], isLoading } = useTasks();
  const { mutate: updateTask } = useUpdateTask();
  // Tasks have no projectId column server-side — a task's project is only
  // reachable indirectly via its entityId -> shot/asset -> projectId. Build
  // that lookup client-side from the already-fetched shots/assets data.
  const { data: liveShots = [] } = useShots();
  const { data: liveAssets = [] } = useAssets();
  const entityProjectMap = useMemo(() => {
    const map: Record<string, string> = {};
    liveShots.forEach((s) => {
      map[s.id] = s.projectId;
    });
    liveAssets.forEach((a) => {
      map[a.id] = a.projectId;
    });
    return map;
  }, [liveShots, liveAssets]);

  const liveUsers = USERS; // Could be replaced with useUsers() later
  const liveProjects = PROJECTS; // Could be replaced with useProjects() later
  const liveDepartments = DEPARTMENTS; // Could be replaced with useDepartments() later

  const { setActiveTaskDrawer, setCreateTaskModalOpen } = useUIStore();
  const { toast } = useToast();

  const { currentUser } = useAuthStore();

  const handleSubmitForReview = (e: MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!currentUser) return;

    updateTask(
      { id: taskId, status: "review" },
      {
        onSuccess: () => {
          toast({ title: "Submitted for Lead Review" });
        },
        onError: () => {
          toast({ title: "Failed to submit", variant: "destructive" });
        },
      },
    );
  };

  const isArtist = currentUser ? currentUser.role === "artist" : true;
  const forceMyTasksOnly = isArtist;
  const currentUserId = currentUser?.id || "";
  const isLeadOrSupervisor =
    !!currentUser && DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role);

  const myDepartmentName = currentUser?.departmentId; // Fallback, could resolve from DEPARTMENTS if needed.

  const filtered = useMemo(() => {
    return liveTasks.filter((t) => {
      if (needsReviewOnly) {
        const awaitingReview = t.status === "review";
        const inMyDepartment =
          !myDepartmentName || t.department === myDepartmentName;
        return awaitingReview && inMyDepartment;
      }

      if (forceMyTasksOnly && t.assignedTo !== currentUserId) return false;

      if (search && !t.title.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (
        projectFilter !== "all" &&
        entityProjectMap[t.entityId] !== projectFilter
      )
        return false;
      if (departmentFilter !== "all" && t.department !== departmentFilter)
        return false;
      if (!forceMyTasksOnly && myTasksOnly && t.assignedTo !== currentUserId)
        return false;

      return true;
    });
  }, [
    search,
    statusFilter,
    projectFilter,
    departmentFilter,
    myTasksOnly,
    forceMyTasksOnly,
    currentUserId,
    liveTasks,
    needsReviewOnly,
    myDepartmentName,
    entityProjectMap,
  ]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: liveTasks.length };
    liveTasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, [liveTasks]);

  const needsReviewCount = useMemo(() => {
    if (!isLeadOrSupervisor) return 0;
    return liveTasks.filter(
      (t) =>
        t.status === "review" &&
        (!myDepartmentName || t.department === myDepartmentName),
    ).length;
  }, [liveTasks, isLeadOrSupervisor, myDepartmentName]);

  if (isLoading) return <div className="p-6">Loading tasks...</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4 h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} tasks
            {needsReviewOnly
              ? " (Needs My Review)"
              : myTasksOnly
                ? " (My Tasks)"
                : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLeadOrSupervisor && (
            <Button
              variant={needsReviewOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setNeedsReviewOnly((v) => !v)}
              className={cn(
                "gap-1.5 touch-target hover-elevate active-elevate-2",
                needsReviewOnly
                  ? "bg-accent-tally text-accent-tally-foreground border-accent-tally hover:bg-accent-tally/90"
                  : needsReviewCount > 0 &&
                      "border-accent-tally/40 text-accent-tally hover:bg-accent-tally/10",
              )}
            >
              <UserCheck className="w-4 h-4" />
              Needs My Review
              {needsReviewCount > 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "px-1.5 py-0 text-[10px] h-4",
                    needsReviewOnly
                      ? "bg-black/10 text-accent-tally-foreground"
                      : "bg-accent-tally/15 text-accent-tally",
                  )}
                >
                  {needsReviewCount}
                </Badge>
              )}
            </Button>
          )}
          {!isArtist && (
            <>
              <Button
                variant={myTasksOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setMyTasksOnly(!myTasksOnly)}
                className="gap-1.5"
              >
                <ListTodo className="w-4 h-4" />{" "}
                {myTasksOnly ? "My Tasks" : "All Tasks"}
              </Button>
              <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border">
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setView("list")}
                  className="h-7 px-2.5 shadow-none"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant={view === "kanban" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setView("kanban")}
                  className="h-7 px-2.5 shadow-none"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
              <Button
                onClick={() => setCreateTaskModalOpen(true)}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
              >
                Assign Task
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto shrink-0 pb-1">
        {[
          "all",
          "not-started",
          "in-progress",
          "review",
          "approved",
          "complete",
        ].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              statusFilter === s
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {s === "all" ? "All" : s.replace(/-/g, " ")} (
            {statusCounts[s] || 0})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {liveProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {liveDepartments.map((d) => (
              <SelectItem key={d.name} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "kanban" ? (
          <KanbanView tasks={filtered} entityProjectMap={entityProjectMap} />
        ) : isMobile ? (
          <div className="rounded-md border border-border overflow-y-auto h-full p-3 space-y-3">
            {filtered.slice(0, 100).map((task) => {
              const assignee = liveUsers.find(
                (u) => u.id === task.assignedTo,
              );
              const project = liveProjects.find(
                (p) => p.id === entityProjectMap[task.entityId],
              );
              return (
                <Card
                  key={task.id}
                  onClick={() => setActiveTaskDrawer(task.id)}
                  className="p-4 cursor-pointer touch-target hover-elevate active-elevate-2 border-border"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[15px] leading-snug">
                        {task.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase"
                        >
                          {task.department}
                        </Badge>
                        {project && (
                          <span className="truncate">{project.name}</span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={task.status} className="shrink-0" />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {assignee && (
                        <>
                          <UserAvatar userId={assignee.id} />
                          <span className="text-sm text-muted-foreground truncate">
                            {assignee.name.split(" ")[0]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/60">
                    <span className="text-xs text-muted-foreground timecode">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString()
                        : "No date"}
                    </span>
                    {task.status === "in-progress" &&
                      task.assignedTo === currentUser?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px] bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 touch-target"
                          onClick={(e) => handleSubmitForReview(e, task.id)}
                        >
                          <Play className="w-3 h-3 mr-1" /> Submit
                        </Button>
                      )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-auto h-full">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/80 backdrop-blur-sm text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium w-[40%]">
                    Task / Context
                  </th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Assignee</th>
                  <th className="h-10 px-4 text-left font-medium">Project</th>
                  <th className="h-10 px-4 text-left font-medium">Due Date</th>
                  <th className="h-10 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((task) => {
                  const assignee = liveUsers.find(
                    (u) => u.id === task.assignedTo,
                  );
                  const project = liveProjects.find(
                    (p) => p.id === entityProjectMap[task.entityId],
                  );
                  return (
                    <tr
                      key={task.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setActiveTaskDrawer(task.id)}
                    >
                      <td className="p-4">
                        <div className="font-medium text-[15px]">
                          {task.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase"
                          >
                            {task.department}
                          </Badge>
                          {task.entityType === "shot" && (
                            <span className="text-indigo-400">
                              Shot: {task.entityId}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="p-4">
                        {assignee && (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={assignee.avatar} />
                              <AvatarFallback className="text-[10px]">
                                {assignee.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">
                              {assignee.name.split(" ")[0]}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground text-xs">
                        {project?.name}
                      </td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : ""}
                      </td>
                      <td className="p-4 text-right">
                        {task.status === "in-progress" &&
                          task.assignedTo === currentUser?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 mr-2"
                              onClick={(e) => handleSubmitForReview(e, task.id)}
                            >
                              <Play className="w-3 h-3 mr-1" /> Submit
                            </Button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
