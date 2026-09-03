import { useMemo, useState } from "react";
import { useTasksStore } from "@/store/tasks";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityChip } from "@/components/shared/PriorityChip";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { USERS, TaskStatus } from "@/data/mockData";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronRight,
  Layers,
  ListTodo,
} from "lucide-react";

const BULK_STATUS_OPTIONS: TaskStatus[] = [
  "todo",
  "in-progress",
  "lead-review",
  "approved",
];

type SortKey =
  "title" | "assignee" | "status" | "priority" | "dueDate" | "estimatedHours";
type GroupKey = "none" | "assignee" | "status" | "priority" | "department";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "assignee", label: "Assignee" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "dueDate", label: "Due Date" },
  { key: "estimatedHours", label: "Est. Hrs" },
];

// store/auth.ts's login hydration overwrites useTasksStore's `tasks` with
// raw, untranslated real TaskDTO[] data (field: `assignedTo`, no
// `assigneeId`/`projectId` at all — see hooks/useTasks.ts's TaskDTO). These
// normalizers tolerate both that real shape and the legacy mock `Task` shape
// (pre-login / pre-hydration) so this view doesn't silently show blank
// assignees or an always-empty list once real data lands.
const getAssigneeId = (t: any): string | null | undefined =>
  t.assignedTo ?? t.assigneeId;

const getProjectId = (
  t: any,
  entityProjectMap: Record<string, string>,
): string | undefined => t.projectId ?? entityProjectMap[t.entityId];

export default function TasksListView({ projectId }: { projectId: string }) {
  const {
    tasks: allTasks,
    updateTask,
    updateTaskStatus,
    reassignTask,
    setTasks,
  } = useTasksStore();
  // Real TaskDTO has no `projectId` column — a task's project is only
  // reachable via entityId -> shot/asset -> projectId (same pattern as
  // pages/tasks.tsx and TasksKanban.tsx).
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
  const tasks = allTasks.filter(
    (t) => getProjectId(t, entityProjectMap) === projectId,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<GroupKey>("status");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{
    taskId: string;
    field: "status" | "priority" | "assignee";
  } | null>(null);
  const { toast } = useToast();

  const sortedTasks = useMemo(() => {
    if (!sortKey) return tasks;
    const assigneeName = (t: (typeof tasks)[number]) =>
      USERS.find((u) => u.id === getAssigneeId(t))?.name ?? "";
    const valueFor = (t: (typeof tasks)[number]) => {
      switch (sortKey) {
        case "assignee":
          return assigneeName(t);
        case "estimatedHours":
          return t.estimatedHours;
        default:
          return t[sortKey];
      }
    };
    return [...tasks].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [tasks, sortKey, sortDir]);

  const groupedTasks = useMemo(() => {
    if (groupBy === "none")
      return [{ key: "__all__", label: "", tasks: sortedTasks }];

    const groups = new Map<string, typeof sortedTasks>();
    sortedTasks.forEach((t) => {
      let groupKey = "";
      switch (groupBy) {
        case "assignee":
          groupKey =
            USERS.find((u) => u.id === getAssigneeId(t))?.name ??
            "Unassigned";
          break;
        case "status":
          groupKey = t.status;
          break;
        case "priority":
          groupKey = t.priority;
          break;
        case "department":
          groupKey = t.department || "General";
          break;
      }
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(t);
    });

    return Array.from(groups.entries()).map(([key, tasks]) => ({
      key,
      label: key,
      tasks,
    }));
  }, [sortedTasks, groupBy]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedGroups(next);
  };

  const handleBulkStatusChange = (status: TaskStatus) => {
    const count = selectedIds.size;
    selectedIds.forEach((id) => updateTaskStatus(id, status));
    toast({
      title: "Status updated",
      description: `${count} task${count === 1 ? "" : "s"} moved to ${status.replace(/-/g, " ")}.`,
    });
    setSelectedIds(new Set());
  };

  const handleBulkReassign = (assigneeId: string) => {
    const count = selectedIds.size;
    const user = USERS.find((u) => u.id === assigneeId);
    // reassignTask (not the generic updateTask) is the store action that
    // actually syncs to the backend with the real `assignedTo` field name —
    // updateTask forwards whatever keys it's given verbatim, so passing
    // `assigneeId` through it would silently no-op server-side.
    selectedIds.forEach((id) => reassignTask(id, assigneeId));
    toast({
      title: "Tasks reassigned",
      description: `${count} task${count === 1 ? "" : "s"} reassigned to ${user?.name ?? "selected user"}.`,
    });
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    setTasks(allTasks.filter((t) => !selectedIds.has(t.id)));
    toast({
      title: "Tasks deleted",
      description: `${count} task${count === 1 ? "" : "s"} permanently removed.`,
    });
    setSelectedIds(new Set());
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Group By Controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20 shrink-0">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Group by:
        </span>
        <Select
          value={groupBy}
          onValueChange={(v) => {
            setGroupBy(v as GroupKey);
            setCollapsedGroups(new Set());
          }}
        >
          <SelectTrigger className="w-40 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">
              None
            </SelectItem>
            <SelectItem value="assignee" className="text-xs">
              Assignee
            </SelectItem>
            <SelectItem value="status" className="text-xs">
              Status
            </SelectItem>
            <SelectItem value="priority" className="text-xs">
              Priority
            </SelectItem>
            <SelectItem value="department" className="text-xs">
              Department
            </SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {tasks.length} tasks
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="absolute top-10 left-0 right-0 h-14 bg-primary/10 border-b border-primary/20 z-10 flex items-center px-4 justify-between animate-in slide-in-from-top-2">
          <div className="text-sm font-medium text-primary">
            {selectedIds.size} tasks selected
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Change Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {BULK_STATUS_OPTIONS.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onSelect={() => handleBulkStatusChange(status)}
                  >
                    <StatusBadge status={status} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Reassign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-64 overflow-y-auto"
              >
                {USERS.map((u) => (
                  <DropdownMenuItem
                    key={u.id}
                    onSelect={() => handleBulkReassign(u.id)}
                  >
                    <div className="flex items-center gap-2">
                      <UserAvatar userId={u.id} className="w-5 h-5" /> {u.name}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedIds.size} task
                    {selectedIds.size === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTodo />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>
              This project doesn't have any tasks yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-0 shadow-sm">
              <tr>
                <th className="p-3 w-10">
                  <Checkbox
                    checked={
                      selectedIds.size === tasks.length && tasks.length > 0
                    }
                    onCheckedChange={toggleAll}
                  />
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="p-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedTasks.map((group) => {
                const isCollapsed = collapsedGroups.has(group.key);
                const completedCount = group.tasks.filter(
                  (t) => t.status === "complete" || t.status === "approved",
                ).length;
                const progressPct =
                  group.tasks.length > 0
                    ? Math.round((completedCount / group.tasks.length) * 100)
                    : 0;

                return (
                  <>
                    {/* Fragment for group */}
                    {/* Group Header Row */}
                    {groupBy !== "none" && (
                      <tr
                        className="bg-muted/40 border-b border-border cursor-pointer hover:bg-muted/60 transition-colors"
                        onClick={() => toggleGroup(group.key)}
                      >
                        <td colSpan={7} className="p-3">
                          <div className="flex items-center gap-3">
                            <ChevronRight
                              className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
                            />
                            <span className="font-semibold text-sm">
                              {group.label}
                            </span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {group.tasks.length}
                            </span>
                            {/* Mini progress bar */}
                            <div className="flex items-center gap-2 ml-auto">
                              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all duration-500"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground font-mono">
                                {progressPct}%
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {/* Tasks in this group */}
                    {!isCollapsed &&
                      group.tasks.map((task) => {
                        const user = USERS.find(
                          (u) => u.id === getAssigneeId(task),
                        );
                        const isSelected = selectedIds.has(task.id);
                        return (
                          <tr
                            key={task.id}
                            className={`border-b border-border hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                          >
                            <td className="p-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleOne(task.id)}
                              />
                            </td>
                            <td className="p-3 font-medium">{task.title}</td>
                            <td
                              className="p-3 cursor-pointer hover:bg-muted/50 rounded transition-colors group relative"
                              onClick={() =>
                                setEditingCell({
                                  taskId: task.id,
                                  field: "assignee",
                                })
                              }
                            >
                              {editingCell?.taskId === task.id &&
                              editingCell?.field === "assignee" ? (
                                <Select
                                  defaultOpen
                                  onOpenChange={(open) => {
                                    if (!open) setEditingCell(null);
                                  }}
                                  onValueChange={(val) => {
                                    reassignTask(task.id, val);
                                    setEditingCell(null);
                                    toast({ description: "Assignee updated" });
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-full min-w-[140px]">
                                    <SelectValue placeholder="Select Assignee" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {USERS.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>
                                        <div className="flex items-center gap-2">
                                          <UserAvatar
                                            userId={u.id}
                                            className="w-5 h-5"
                                          />{" "}
                                          {u.name}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex items-center gap-2 relative">
                                  <UserAvatar userId={getAssigneeId(task) ?? ""} />
                                  <span>{user?.name}</span>
                                  <div className="absolute right-0 opacity-0 group-hover:opacity-100 bg-muted/80 px-1 rounded text-[10px] text-muted-foreground pointer-events-none">
                                    Click to edit
                                  </div>
                                </div>
                              )}
                            </td>
                            <td
                              className="p-3 cursor-pointer hover:bg-muted/50 rounded transition-colors group relative"
                              onClick={() =>
                                setEditingCell({
                                  taskId: task.id,
                                  field: "status",
                                })
                              }
                            >
                              {editingCell?.taskId === task.id &&
                              editingCell?.field === "status" ? (
                                <Select
                                  defaultOpen
                                  onOpenChange={(open) => {
                                    if (!open) setEditingCell(null);
                                  }}
                                  onValueChange={(val: any) => {
                                    updateTask(task.id, { status: val });
                                    setEditingCell(null);
                                    toast({ description: "Status updated" });
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-full min-w-[120px]">
                                    <SelectValue placeholder="Select Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="todo">
                                      <StatusBadge status="todo" />
                                    </SelectItem>
                                    <SelectItem value="in-progress">
                                      <StatusBadge status="in-progress" />
                                    </SelectItem>
                                    <SelectItem value="lead-review">
                                      <StatusBadge status="lead-review" />
                                    </SelectItem>
                                    <SelectItem value="approved">
                                      <StatusBadge status="approved" />
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <>
                                  <StatusBadge status={task.status} />
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-muted/90 px-1 rounded text-[10px] text-muted-foreground pointer-events-none">
                                    Edit
                                  </div>
                                </>
                              )}
                            </td>
                            <td
                              className="p-3 cursor-pointer hover:bg-muted/50 rounded transition-colors group relative"
                              onClick={() =>
                                setEditingCell({
                                  taskId: task.id,
                                  field: "priority",
                                })
                              }
                            >
                              {editingCell?.taskId === task.id &&
                              editingCell?.field === "priority" ? (
                                <Select
                                  defaultOpen
                                  onOpenChange={(open) => {
                                    if (!open) setEditingCell(null);
                                  }}
                                  onValueChange={(val: any) => {
                                    updateTask(task.id, { priority: val });
                                    setEditingCell(null);
                                    toast({ description: "Priority updated" });
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-full min-w-[100px]">
                                    <SelectValue placeholder="Select Priority" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">
                                      <PriorityChip priority="low" />
                                    </SelectItem>
                                    <SelectItem value="medium">
                                      <PriorityChip priority="medium" />
                                    </SelectItem>
                                    <SelectItem value="high">
                                      <PriorityChip priority="high" />
                                    </SelectItem>
                                    <SelectItem value="critical">
                                      <PriorityChip priority="critical" />
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <>
                                  <PriorityChip priority={task.priority} />
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-muted/90 px-1 rounded text-[10px] text-muted-foreground pointer-events-none">
                                    Edit
                                  </div>
                                </>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {task.dueDate}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {task.estimatedHours}h
                            </td>
                          </tr>
                        );
                      })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
